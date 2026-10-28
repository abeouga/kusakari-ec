package jp.kusakari.ec.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@ConditionalOnProperty(name = "kusakari.auth.mode", havingValue = "cognito")
public class PasswordLoginController {

  private final CognitoPasswordLogin passwords;
  private final AuthService members;
  private final AuthUrls urls;

  @PostMapping("/api/auth/login")
  public Map<String, String> login(
    @Valid @RequestBody LoginRequest input,
    HttpServletRequest request,
    HttpServletResponse response
  ) {
    var login = passwords.authenticate(input.email().trim(), input.password());
    var user = login.user();
    members.provision(user);
    var context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(new OAuth2AuthenticationToken(user, user.getAuthorities(), "cognito"));
    SecurityContextHolder.setContext(context);
    try {
      members.current();
      if (request.getSession(false) != null) request.changeSessionId();
      CognitoRefreshSession.store(request, login.refreshToken());
      new HttpSessionCsrfTokenRepository().saveToken(null, request, response);
      new HttpSessionSecurityContextRepository().saveContext(context, request, response);
      return Map.of("returnTo", urls.safeReturn(input.returnTo()));
    } catch (ApiException error) {
      SecurityContextHolder.clearContext();
      if (request.getSession(false) != null) request.getSession(false).invalidate();
      throw error;
    }
  }

  @PutMapping("/api/account/password")
  public Map<String, Boolean> changePassword(@Valid @RequestBody PasswordRequest input, HttpServletRequest request) {
    var member = members.current();
    if (!input.newPassword().equals(input.confirmPassword())) throw new ApiException(
      400,
      "PASSWORD_MISMATCH",
      "新しいパスワードと確認用パスワードが一致しません。"
    );
    passwords.changePassword(member.getEmail(), member.getSubject(), input.currentPassword(), input.newPassword());
    request.getSession().invalidate();
    SecurityContextHolder.clearContext();
    return Map.of("changed", true);
  }

  public record PasswordRequest(
    @NotBlank @Size(max = 256) String currentPassword,
    @NotBlank @Size(min = 8, max = 256) String newPassword,
    @NotBlank @Size(max = 256) String confirmPassword
  ) {
    @Override
    public String toString() {
      return "PasswordRequest[redacted]";
    }
  }

  public record LoginRequest(
    @NotBlank @Email @Size(max = 254) String email,
    @NotBlank @Size(max = 256) String password,
    @Size(max = 2048) String returnTo
  ) {
    @Override
    public String toString() {
      return "LoginRequest[redacted]";
    }
  }
}
