package jp.kusakari.ec.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.InMemoryOAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.*;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class AuthConfiguration {

  @Bean
  @ConditionalOnProperty(name = "kusakari.auth.mode", havingValue = "cognito")
  ClientRegistrationRepository cognitoClients(
    @org.springframework.beans.factory.annotation.Value("${KUSAKARI_COGNITO_CLIENT_ID}") String clientId,
    @org.springframework.beans.factory.annotation.Value("${KUSAKARI_COGNITO_ISSUER}") String issuer,
    @org.springframework.beans.factory.annotation.Value("${KUSAKARI_COGNITO_DOMAIN}") String domain,
    @org.springframework.beans.factory.annotation.Value("${kusakari.ec.web-origin}") String origin
  ) {
    for (String endpoint : java.util.List.of(issuer, domain)) {
      var uri = java.net.URI.create(endpoint);
      if (
        !"https".equals(uri.getScheme()) ||
        uri.getHost() == null ||
        uri.getRawUserInfo() != null ||
        uri.getRawQuery() != null ||
        uri.getRawFragment() != null ||
        endpoint.endsWith("/")
      ) {
        throw new IllegalArgumentException(
          "Cognito endpoints must be HTTPS URLs without credentials, query, fragment or trailing slash."
        );
      }
    }
    if (clientId.isBlank()) throw new IllegalArgumentException("Cognito client ID is required.");
    var client = org.springframework.security.oauth2.client.registration.ClientRegistration.withRegistrationId(
      "cognito"
    )
      .clientId(clientId)
      .clientAuthenticationMethod(org.springframework.security.oauth2.core.ClientAuthenticationMethod.NONE)
      .authorizationGrantType(org.springframework.security.oauth2.core.AuthorizationGrantType.AUTHORIZATION_CODE)
      .redirectUri(origin + "/api/auth/callback/cognito")
      .scope("openid", "email", "profile")
      .authorizationUri(domain + "/oauth2/authorize")
      .tokenUri(domain + "/oauth2/token")
      .jwkSetUri(issuer + "/.well-known/jwks.json")
      .userInfoUri(domain + "/oauth2/userInfo")
      .userNameAttributeName("sub")
      .issuerUri(issuer)
      .clientName("Kusakari")
      .build();
    return new org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository(client);
  }

  @Bean
  @ConditionalOnProperty(name = "kusakari.auth.mode", havingValue = "demo")
  SecurityFilterChain demoSecurity(HttpSecurity http, org.springframework.core.env.Environment environment)
    throws Exception {
    if (!"true".equals(environment.getProperty("kusakari.test-auth"))) throw new IllegalStateException(
      "Cognito is required outside explicit isolated tests."
    );
    return http
      .csrf(csrf -> csrf.disable())
      .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
      .build();
  }

  @Bean
  @ConditionalOnProperty(name = "kusakari.auth.mode", havingValue = "cognito")
  SecurityFilterChain cognitoSecurity(
    HttpSecurity http,
    AuthService members,
    ClientRegistrationRepository clients,
    ObjectMapper json,
    AuthUrls urls,
    CognitoPasswordLogin passwords
  ) throws Exception {
    // Holds the Cognito refresh token only until the success handler moves it into the HTTP session.
    var authorizedClients = new InMemoryOAuth2AuthorizedClientService(clients);
    var resolver = new DefaultOAuth2AuthorizationRequestResolver(clients, "/api/auth/authorize");
    resolver.setAuthorizationRequestCustomizer(OAuth2AuthorizationRequestCustomizers.withPkce());
    var requests = new OAuth2AuthorizationRequestResolver() {
      private OAuth2AuthorizationRequest customize(OAuth2AuthorizationRequest value, HttpServletRequest request) {
        if (value == null || !"true".equals(request.getParameter("signup"))) return value;
        return OAuth2AuthorizationRequest.from(value)
          .additionalParameters(params -> params.put("screen_hint", "signup"))
          .build();
      }

      public OAuth2AuthorizationRequest resolve(HttpServletRequest request) {
        return customize(resolver.resolve(request), request);
      }

      public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String id) {
        return customize(resolver.resolve(request, id), request);
      }
    };
    return http
      .csrf(csrf -> csrf.ignoringRequestMatchers("/api/products/references", "/api/materials/quote"))
      .addFilterBefore(
        new SessionValidityFilter(members, passwords, json),
        org.springframework.security.web.access.intercept.AuthorizationFilter.class
      )
      .requestCache(cache -> cache.disable())
      .authorizeHttpRequests(auth ->
        auth
          .requestMatchers(
            "/api/auth/me",
            "/api/auth/csrf",
            "/api/auth/login",
            "/api/auth/reset",
            "/api/auth/authorize/**",
            "/api/auth/callback/**",
            "/api/health",
            "/api/health/ready"
          )
          .permitAll()
          .requestMatchers(
            org.springframework.http.HttpMethod.GET,
            "/api/products",
            "/api/product-images/**",
            "/api/stores",
            "/api/categories",
            "/api/stores/*"
          )
          .permitAll()
          .requestMatchers("/api/products/references", "/api/materials/quote")
          .permitAll()
          .anyRequest()
          .authenticated()
      )
      .oauth2Login(login ->
        login
          .authorizationEndpoint(endpoint -> endpoint.authorizationRequestResolver(requests))
          .redirectionEndpoint(endpoint -> endpoint.baseUri("/api/auth/callback/*"))
          .authorizedClientService(authorizedClients)
          .successHandler((request, response, authentication) -> {
            try {
              members.provision((OidcUser) authentication.getPrincipal());
              members.current();
              var token = (OAuth2AuthenticationToken) authentication;
              var client = authorizedClients.loadAuthorizedClient(
                token.getAuthorizedClientRegistrationId(),
                token.getName()
              );
              authorizedClients.removeAuthorizedClient(token.getAuthorizedClientRegistrationId(), token.getName());
              if (client == null || client.getRefreshToken() == null) throw new IllegalStateException(
                "Cognito refresh token is required."
              );
              CognitoRefreshSession.store(request, client.getRefreshToken().getTokenValue());
              var session = request.getSession();
              Object target = session.getAttribute("AUTH_RETURN_TO");
              session.removeAttribute("AUTH_RETURN_TO");
              response.sendRedirect(urls.safeReturn(target instanceof String value ? value : null));
            } catch (RuntimeException error) {
              request.getSession().invalidate();
              org.springframework.security.core.context.SecurityContextHolder.clearContext();
              response.sendRedirect(urls.webOrigin() + "/account/login?auth=failed");
            }
          })
          .failureHandler((request, response, error) -> {
            if (request.getSession(false) != null) request.getSession(false).invalidate();
            response.sendRedirect(urls.webOrigin() + "/account/login?auth=failed");
          })
      )
      .logout(logout ->
        logout
          .logoutUrl("/api/auth/logout")
          .deleteCookies("KUSAKARI_SESSION")
          .logoutSuccessHandler((request, response, authentication) -> {
            response.setContentType("application/json;charset=UTF-8");
            json.writeValue(response.getWriter(), Map.of("logoutUrl", urls.logout()));
          })
      )
      .exceptionHandling(errors ->
        errors
          .authenticationEntryPoint((request, response, error) -> {
            response.setStatus(401);
            response.setContentType("application/json;charset=UTF-8");
            json.writeValue(
              response.getWriter(),
              Map.of("status", 401, "code", "LOGIN_REQUIRED", "message", "ログインしてください。")
            );
          })
          .accessDeniedHandler((request, response, error) -> {
            response.setStatus(403);
            response.setContentType("application/json;charset=UTF-8");
            json.writeValue(
              response.getWriter(),
              Map.of("status", 403, "code", "FORBIDDEN", "message", "操作の権限または確認情報が無効です。")
            );
          })
      )
      .build();
  }
}
