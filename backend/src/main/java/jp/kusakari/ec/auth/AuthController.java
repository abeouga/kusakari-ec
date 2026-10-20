package jp.kusakari.ec.auth;

import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

  private final AuthService auth;
  private final AuthUrls urls;

  @GetMapping("/me")
  public AuthService.SessionView me() {
    return auth.session();
  }

  @PostMapping("/verify")
  public AuthService.SessionView verify() {
    auth.current();
    return auth.session();
  }

  @GetMapping("/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return token == null ? Map.of() : Map.of("headerName", token.getHeaderName(), "token", token.getToken());
  }

  @GetMapping("/login")
  public void login(
    @RequestParam(required = false) String returnTo,
    @RequestParam(defaultValue = "false") boolean signup,
    HttpServletRequest request,
    HttpServletResponse response
  ) throws IOException {
    if (!auth.enabled()) {
      response.sendError(503);
      return;
    }
    request.getSession().setAttribute("AUTH_RETURN_TO", urls.safeReturn(returnTo));
    response.sendRedirect("/api/auth/authorize/cognito" + (signup ? "?signup=true" : ""));
  }

  @GetMapping("/reset")
  public void reset(HttpServletResponse response) throws IOException {
    if (!auth.enabled()) {
      response.sendError(503);
      return;
    }
    // Use the normal authorization flow so the provider's password-reset screen retains valid state/PKCE.
    response.sendRedirect("/api/auth/login");
  }
}
