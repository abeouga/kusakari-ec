package jp.kusakari.ec.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Map;
import jp.kusakari.ec.common.web.ApiException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

public class SessionValidityFilter extends OncePerRequestFilter {

  private final AuthService members;
  private final CognitoPasswordLogin passwords;
  private final ObjectMapper json;

  public SessionValidityFilter(AuthService members, CognitoPasswordLogin passwords, ObjectMapper json) {
    this.members = members;
    this.passwords = passwords;
    this.json = json;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
    throws IOException, ServletException {
    var auth = SecurityContextHolder.getContext().getAuthentication();
    String path = request.getRequestURI();
    boolean login =
      path.startsWith("/api/auth/authorize/") ||
      path.startsWith("/api/auth/callback/") ||
      path.equals("/api/auth/login") ||
      path.equals("/api/auth/logout");
    if (!login && auth != null && auth.getPrincipal() instanceof OidcUser user) {
      try {
        if (!AuthService.idTokenValid(user)) renewIdToken(request, response, auth);
        members.current();
      } catch (ApiException error) {
        // 503 means Cognito could not be reached. Keep the session so the next request can retry.
        if (error.status() != 503) {
          if (request.getSession(false) != null) request.getSession(false).invalidate();
          SecurityContextHolder.clearContext();
        }
        if (error.status() == 401 && path.equals("/api/auth/me")) {
          chain.doFilter(request, response);
          return;
        }
        response.setStatus(error.status());
        response.setContentType("application/json;charset=UTF-8");
        json.writeValue(
          response.getWriter(),
          Map.of("status", error.status(), "code", error.code(), "message", error.getMessage())
        );
        return;
      }
    }
    chain.doFilter(request, response);
  }

  private void renewIdToken(HttpServletRequest request, HttpServletResponse response, Authentication auth) {
    var refreshToken = CognitoRefreshSession.find(request);
    if (refreshToken == null || !(auth instanceof OAuth2AuthenticationToken token)) throw new ApiException(
      401,
      "LOGIN_REQUIRED",
      "ログインしてください。"
    );
    var user = passwords.refresh(refreshToken, ((OidcUser) auth.getPrincipal()).getSubject());
    var context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(
      new OAuth2AuthenticationToken(user, user.getAuthorities(), token.getAuthorizedClientRegistrationId())
    );
    SecurityContextHolder.setContext(context);
    new HttpSessionSecurityContextRepository().saveContext(context, request, response);
  }
}
