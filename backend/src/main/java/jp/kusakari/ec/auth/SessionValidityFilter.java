package jp.kusakari.ec.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Map;
import jp.kusakari.ec.common.web.ApiException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.filter.OncePerRequestFilter;

public class SessionValidityFilter extends OncePerRequestFilter {

  private final AuthService members;
  private final ObjectMapper json;

  public SessionValidityFilter(AuthService members, ObjectMapper json) {
    this.members = members;
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
    if (!login && auth != null && auth.getPrincipal() instanceof OidcUser) {
      try {
        members.current();
      } catch (ApiException error) {
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        SecurityContextHolder.clearContext();
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
}
