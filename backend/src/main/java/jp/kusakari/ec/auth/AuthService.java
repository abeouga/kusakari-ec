package jp.kusakari.ec.auth;

import java.time.Instant;
import java.util.List;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

  private final AuthMemberRepository members;
  private final jp.kusakari.ec.catalog.persistence.repository.StoreRepository stores;

  @Value("${kusakari.auth.mode:cognito}")
  private String mode;

  public boolean enabled() {
    return "cognito".equals(mode);
  }

  @Transactional
  public void provision(OidcUser user) {
    if (!Boolean.TRUE.equals(user.getEmailVerified())) throw new ApiException(
      403,
      "EMAIL_UNVERIFIED",
      "メール確認が必要です。"
    );
    String issuer = user.getIssuer().toString();
    if (members.findByIssuerAndSubject(issuer, user.getSubject()).isEmpty()) {
      String name = user.getFullName() == null ? user.getEmail() : user.getFullName();
      members.saveAndFlush(
        new AuthMember(issuer, user.getSubject(), user.getEmail(), name.substring(0, Math.min(name.length(), 100)))
      );
    }
  }

  @Transactional(readOnly = true)
  public AuthMember current() {
    var authentication = SecurityContextHolder.getContext().getAuthentication();
    if (
      authentication == null ||
      !(authentication.getPrincipal() instanceof OidcUser user) ||
      !idTokenValid(user)
    ) {
      throw new ApiException(401, "LOGIN_REQUIRED", "ログインしてください。");
    }
    var member = members
      .findByIssuerAndSubject(user.getIssuer().toString(), user.getSubject())
      .orElseThrow(() -> new ApiException(401, "LOGIN_REQUIRED", "再度ログインしてください。"));
    if (!member.isEnabled()) throw new ApiException(403, "ACCOUNT_DISABLED", "このアカウントは利用できません。");
    return member;
  }

  static boolean idTokenValid(OidcUser user) {
    var expiresAt = user.getIdToken().getExpiresAt();
    return expiresAt != null && expiresAt.isAfter(Instant.now());
  }

  public SessionView session() {
    if (!enabled()) return new SessionView("demo", false, null, null, null, null, List.of());
    try {
      var member = current();
      return new SessionView(
        "cognito",
        true,
        member.getId(),
        member.getEmail(),
        member.getDisplayName(),
        member.getRole(),
        member.getStoreId() == null ? List.of() : List.of(member.getStoreId())
      );
    } catch (ApiException error) {
      if (error.status() != 401) throw error;
      return new SessionView("cognito", false, null, null, null, null, List.of());
    }
  }

  public void requireSeller(Long storeId) {
    if (!enabled()) return;
    var member = current();
    if ("ADMIN".equals(member.getRole())) return;
    if (!"SELLER".equals(member.getRole()) || !java.util.Objects.equals(storeId, member.getStoreId())) denied();
    if (
      !stores
        .findById(storeId)
        .map(s -> s.isEnabled())
        .orElse(false)
    ) denied();
  }

  public void requireAdmin() {
    if (enabled() && !"ADMIN".equals(current().getRole())) denied();
  }

  public void requireSellerRole() {
    if (enabled() && !List.of("SELLER", "ADMIN").contains(current().getRole())) denied();
  }

  public void requireProductOwner(String owner) {
    if (!enabled()) return;
    var member = current();
    if (
      !"ADMIN".equals(member.getRole()) && !("SELLER".equals(member.getRole()) && member.getId().equals(owner))
    ) throw new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。");
    if (!"ADMIN".equals(member.getRole())) requireSeller(member.getStoreId());
  }

  private static void denied() {
    throw new ApiException(403, "FORBIDDEN", "この操作の権限がありません。");
  }

  public record SessionView(
    String mode,
    boolean authenticated,
    String id,
    String email,
    String name,
    String role,
    List<Long> storeIds
  ) {}
}
