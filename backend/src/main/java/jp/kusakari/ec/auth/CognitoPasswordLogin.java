package jp.kusakari.ec.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import jp.kusakari.ec.common.web.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Service
@ConditionalOnProperty(name = "kusakari.auth.mode", havingValue = "cognito")
public class CognitoPasswordLogin {

  private final RestClient client;
  private final String clientId;
  private final NimbusJwtDecoder decoder;

  public CognitoPasswordLogin(
    @Value("${KUSAKARI_COGNITO_ISSUER}") String issuer,
    @Value("${KUSAKARI_COGNITO_CLIENT_ID}") String clientId,
    ObjectMapper json
  ) {
    // The AWS API endpoint is derived from the configured issuer, never from browser input.
    var uri = URI.create(issuer);
    if (!issuer.matches("https://cognito-idp\\.[a-z0-9-]+\\.amazonaws\\.com/[a-z0-9-]+_[A-Za-z0-9]+")) {
      throw new IllegalArgumentException("A valid Cognito issuer is required.");
    }
    this.clientId = clientId;
    var factory = new JdkClientHttpRequestFactory(
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    );
    factory.setReadTimeout(Duration.ofSeconds(10));
    var awsJson = new org.springframework.http.converter.json.MappingJackson2HttpMessageConverter(json);
    awsJson.setSupportedMediaTypes(
      List.of(org.springframework.http.MediaType.parseMediaType("application/x-amz-json-1.1"))
    );
    client = RestClient.builder()
      .baseUrl("https://" + uri.getHost())
      .requestFactory(factory)
      .messageConverters(converters -> converters.add(0, awsJson))
      .build();
    decoder = NimbusJwtDecoder.withJwkSetUri(issuer + "/.well-known/jwks.json").build();
    OAuth2TokenValidator<Jwt> claims = token -> {
      boolean valid =
        token.getAudience().contains(clientId) &&
        "id".equals(token.getClaimAsString("token_use")) &&
        token.getSubject() != null &&
        token.getIssuedAt() != null &&
        token.getExpiresAt() != null;
      return valid
        ? OAuth2TokenValidatorResult.success()
        : OAuth2TokenValidatorResult.failure(
            new OAuth2Error("invalid_token", "Invalid Cognito ID token claims.", null)
          );
    };
    decoder.setJwtValidator(
      new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(issuer), claims)
    );
  }

  private record Tokens(OidcUser user, String accessToken) {
    @Override
    public String toString() {
      return "Tokens[redacted]";
    }
  }

  public OidcUser authenticate(String email, String password) {
    return authenticateTokens(email, password).user();
  }

  public void changePassword(String email, String subject, String previous, String proposed) {
    var tokens = authenticateTokens(email, previous);
    if (!tokens.user().getSubject().equals(subject)) throw new ApiException(
      403,
      "FORBIDDEN",
      "本人確認に失敗しました。"
    );
    try {
      client
        .post()
        .uri("/")
        .header("Content-Type", "application/x-amz-json-1.1")
        .header("X-Amz-Target", "AWSCognitoIdentityProviderService.ChangePassword")
        .body(Map.of("AccessToken", tokens.accessToken(), "PreviousPassword", previous, "ProposedPassword", proposed))
        .retrieve()
        .toBodilessEntity();
    } catch (RestClientResponseException error) {
      throw new ApiException(
        400,
        "PASSWORD_REJECTED",
        "パスワードを変更できません。パスワードの条件または試行間隔を確認してください。"
      );
    } catch (RestClientException error) {
      throw new ApiException(503, "AUTH_UNAVAILABLE", "認証サービスに接続できません。");
    }
  }

  private Tokens authenticateTokens(String email, String password) {
    try {
      var result = client
        .post()
        .uri("/")
        .header("Content-Type", "application/x-amz-json-1.1")
        .header("X-Amz-Target", "AWSCognitoIdentityProviderService.InitiateAuth")
        .body(
          Map.of(
            "ClientId",
            clientId,
            "AuthFlow",
            "USER_PASSWORD_AUTH",
            "AuthParameters",
            Map.of("USERNAME", email, "PASSWORD", password)
          )
        )
        .retrieve()
        .body(JsonNode.class);
      if (result == null) throw new ApiException(503, "AUTH_UNAVAILABLE", "認証サービスに接続できません。");
      if (result.hasNonNull("ChallengeName")) throw new ApiException(
        409,
        "AUTH_CHALLENGE_REQUIRED",
        "追加の本人確認またはパスワード変更が必要です。認証画面で手続きを完了してください。"
      );
      String value = result.path("AuthenticationResult").path("IdToken").asText("");
      Jwt jwt = decoder.decode(value);
      var token = new OidcIdToken(value, jwt.getIssuedAt(), jwt.getExpiresAt(), jwt.getClaims());
      return new Tokens(
        new DefaultOidcUser(List.of(new OidcUserAuthority(token)), token),
        result.path("AuthenticationResult").path("AccessToken").asText()
      );
    } catch (RestClientResponseException error) {
      String type = "";
      try {
        var body = error.getResponseBodyAs(JsonNode.class);
        if (body != null) type = body.path("__type").asText("");
      } catch (RuntimeException ignored) {
        /* Never expose the upstream response. */
      }
      if (type.endsWith("NotAuthorizedException") || type.endsWith("UserNotFoundException")) {
        throw new ApiException(401, "INVALID_CREDENTIALS", "メールアドレスまたはパスワードが正しくありません。");
      }
      if (type.endsWith("TooManyRequestsException")) {
        throw new ApiException(429, "AUTH_RATE_LIMITED", "試行回数が多すぎます。時間をおいて再試行してください。");
      }
      if (type.endsWith("PasswordResetRequiredException") || type.endsWith("UserNotConfirmedException")) {
        throw new ApiException(
          409,
          "AUTH_CHALLENGE_REQUIRED",
          "認証画面でメール確認またはパスワード再設定を完了してください。"
        );
      }
      throw new ApiException(503, "AUTH_UNAVAILABLE", "認証サービスに接続できません。時間をおいて再試行してください。");
    } catch (RestClientException | JwtException | IllegalArgumentException error) {
      throw new ApiException(503, "AUTH_UNAVAILABLE", "認証を確認できません。時間をおいて再試行してください。");
    }
  }
}
