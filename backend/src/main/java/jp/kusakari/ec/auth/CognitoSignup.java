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
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Issue #87: self sign-up through the Cognito public API so the custom login card can host it
 * instead of redirecting to the Hosted UI. The user pool uses the email address as the username.
 */
@Service
@ConditionalOnProperty(name = "kusakari.auth.mode", havingValue = "cognito")
public class CognitoSignup {

  private final RestClient client;
  private final String clientId;

  public CognitoSignup(
    @Value("${KUSAKARI_COGNITO_ISSUER}") String issuer,
    @Value("${KUSAKARI_COGNITO_CLIENT_ID}") String clientId,
    ObjectMapper json
  ) {
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
      .baseUrl("https://" + URI.create(issuer).getHost())
      .requestFactory(factory)
      .messageConverters(converters -> converters.add(0, awsJson))
      .build();
  }

  public void signUp(String email, String password) {
    call(
      "SignUp",
      Map.of(
        "ClientId",
        clientId,
        "Username",
        email,
        "Password",
        password,
        "UserAttributes",
        List.of(Map.of("Name", "email", "Value", email))
      )
    );
  }

  public void confirm(String email, String code) {
    call("ConfirmSignUp", Map.of("ClientId", clientId, "Username", email, "ConfirmationCode", code));
  }

  public void resend(String email) {
    call("ResendConfirmationCode", Map.of("ClientId", clientId, "Username", email));
  }

  private void call(String action, Map<String, Object> body) {
    try {
      client
        .post()
        .uri("/")
        .header("Content-Type", "application/x-amz-json-1.1")
        .header("X-Amz-Target", "AWSCognitoIdentityProviderService." + action)
        .body(body)
        .retrieve()
        .toBodilessEntity();
    } catch (RestClientResponseException error) {
      throw translate(action, errorType(error));
    } catch (RestClientException error) {
      throw new ApiException(503, "AUTH_UNAVAILABLE", "認証サービスに接続できません。時間をおいて再試行してください。");
    }
  }

  private static String errorType(RestClientResponseException error) {
    try {
      var body = error.getResponseBodyAs(JsonNode.class);
      if (body != null) return body.path("__type").asText("");
    } catch (RuntimeException ignored) {
      /* Never expose the upstream response. */
    }
    return "";
  }

  private static ApiException translate(String action, String type) {
    String name = type.substring(type.lastIndexOf('#') + 1);
    return switch (name) {
      case "UsernameExistsException" -> new ApiException(
        409,
        "EMAIL_IN_USE",
        "このメールアドレスは既に登録されています。ログインしてください。"
      );
      case "InvalidPasswordException" -> new ApiException(
        400,
        "PASSWORD_REJECTED",
        "パスワードが条件を満たしていません。8文字以上で入力してください。"
      );
      case "CodeMismatchException", "UserNotFoundException" -> new ApiException(
        400,
        "CODE_MISMATCH",
        "確認コードが正しくありません。"
      );
      case "ExpiredCodeException" -> new ApiException(
        400,
        "CODE_EXPIRED",
        "確認コードの有効期限が切れています。コードを再送してください。"
      );
      case "NotAuthorizedException" -> "SignUp".equals(action)
        ? new ApiException(503, "AUTH_UNAVAILABLE", "現在、新規登録を受け付けていません。")
        : new ApiException(409, "ALREADY_CONFIRMED", "このアカウントは確認済みです。ログインしてください。");
      case "TooManyRequestsException", "LimitExceededException", "TooManyFailedAttemptsException" -> new ApiException(
        429,
        "AUTH_RATE_LIMITED",
        "試行回数が多すぎます。時間をおいて再試行してください。"
      );
      case "InvalidParameterException" -> new ApiException(400, "INVALID_SIGNUP", "入力内容を確認してください。");
      case "CodeDeliveryFailureException" -> new ApiException(
        503,
        "CODE_DELIVERY_FAILED",
        "確認コードを送信できませんでした。メールアドレスを確認してください。"
      );
      default -> new ApiException(
        503,
        "AUTH_UNAVAILABLE",
        "認証サービスに接続できません。時間をおいて再試行してください。"
      );
    };
  }
}
