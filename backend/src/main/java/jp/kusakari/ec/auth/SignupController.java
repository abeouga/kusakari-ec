package jp.kusakari.ec.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.service.StoreInvitationService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;

/** Issue #87: sign-up steps for the custom login card. Login after confirmation uses /api/auth/login. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth/signup")
@ConditionalOnProperty(name = "kusakari.auth.mode", havingValue = "cognito")
public class SignupController {

  private final CognitoSignup cognito;
  private final AuthService members;
  private final StoreInvitationService invitations;

  @PostMapping
  public Map<String, Boolean> signUp(@Valid @RequestBody SignupRequest input) {
    if (!input.password().equals(input.confirmPassword())) throw new ApiException(
      400,
      "PASSWORD_MISMATCH",
      "パスワードと確認用パスワードが一致しません。"
    );
    String email = input.email().trim();
    String key = input.invitationKey() == null ? "" : input.invitationKey().trim();
    if (!key.isEmpty()) {
      if (input.business()) throw new ApiException(
        400,
        "INVALID_SIGNUP",
        "招待キーでの登録と企業様向けの登録は同時にできません。"
      );
      // 招待キーでの登録（#111）。キーが使えるときだけ Cognito に登録し、担当者（ロールなし）として会員を作る。
      invitations.register(key, cognito.issuer(), email, () -> cognito.signUp(email, input.password()));
      return Map.of("codeSent", true);
    }
    String subject = cognito.signUp(email, input.password());
    // 企業様向けの登録では、この時点で申請中の会員を作る。購入者は、初めてログインしたときに作る。
    if (input.business()) members.registerApplicant(cognito.issuer(), subject, email);
    return Map.of("codeSent", true);
  }

  @PostMapping("/confirm")
  public Map<String, Boolean> confirm(@Valid @RequestBody ConfirmRequest input) {
    cognito.confirm(input.email().trim(), input.code().trim());
    return Map.of("confirmed", true);
  }

  @PostMapping("/resend")
  public Map<String, Boolean> resend(@Valid @RequestBody ResendRequest input) {
    cognito.resend(input.email().trim());
    return Map.of("codeSent", true);
  }

  public record SignupRequest(
    @NotBlank @Email @Size(max = 254) String email,
    @NotBlank @Size(min = 8, max = 256) String password,
    @NotBlank @Size(max = 256) String confirmPassword,
    boolean business,
    @Pattern(regexp = "\\s*(" + StoreInvitationService.KEY_PATTERN + ")?\\s*") String invitationKey
  ) {
    @Override
    public String toString() {
      return "SignupRequest[redacted]";
    }
  }

  public record ConfirmRequest(
    @NotBlank @Email @Size(max = 254) String email,
    @NotBlank @Pattern(regexp = "\\s*\\d{6}\\s*") String code
  ) {}

  public record ResendRequest(@NotBlank @Email @Size(max = 254) String email) {}
}
