package jp.kusakari.ec.auth;

import java.time.Instant;
import java.util.List;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEntity;
import jp.kusakari.ec.store.persistence.entity.StoreMemberEntity;
import jp.kusakari.ec.store.persistence.entity.StoreMemberId;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import jp.kusakari.ec.store.persistence.repository.StoreMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 会員の種別と、店舗を操作できるかの判定。
 * オーナーは自分の組織の全店舗、子アカウントは担当の店舗を店舗ごとのロールで、運営は全店舗を扱える。
 */
@Service
@RequiredArgsConstructor
public class AuthService {

  private final AuthMemberRepository members;
  private final StoreRepository stores;
  private final OrganizationRepository organizations;
  private final StoreMemberRepository storeMembers;
  private final OrganizationMemberRepository organizationMembers;

  @Value("${kusakari.auth.mode:cognito}")
  private String mode;

  public boolean enabled() {
    return "cognito".equals(mode);
  }

  /** 初めてログインした購入者の会員を作る。企業様向けの登録で作った会員は、ここでメール確認済みにする。 */
  @Transactional
  public void provision(OidcUser user) {
    if (!Boolean.TRUE.equals(user.getEmailVerified())) throw new ApiException(
      403,
      "EMAIL_UNVERIFIED",
      "メール確認が必要です。"
    );
    String issuer = user.getIssuer().toString();
    var existing = members.findByIssuerAndSubject(issuer, user.getSubject());
    if (existing.isPresent()) {
      existing.get().markEmailVerified();
      return;
    }
    String name = user.getFullName() == null ? user.getEmail() : user.getFullName();
    var member = new AuthMember(issuer, user.getSubject(), user.getEmail(), limit(name), AuthMember.USER);
    member.markEmailVerified();
    members.saveAndFlush(member);
  }

  /** 企業様向けの登録。登録した時点で、申請中の法人用アカウントとして会員を作る。 */
  @Transactional
  public void registerApplicant(String issuer, String subject, String email) {
    if (members.findByIssuerAndSubject(issuer, subject).isPresent()) return;
    members.saveAndFlush(new AuthMember(issuer, subject, email, limit(email), AuthMember.SHOP_OWNER_APPLICANT));
  }

  private static String limit(String name) {
    return name.substring(0, Math.min(name.length(), 120));
  }

  @Transactional(readOnly = true)
  public AuthMember current() {
    var authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !(authentication.getPrincipal() instanceof OidcUser user) || !idTokenValid(user)) {
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

  @Transactional(readOnly = true)
  public SessionView session() {
    if (!enabled()) return new SessionView("demo", false, null, null, null, null, null, null, List.of());
    try {
      var member = current();
      return new SessionView(
        "cognito",
        true,
        member.getId(),
        member.getEmail(),
        member.getDisplayName(),
        member.getAccountType(),
        organizationIdOf(member),
        organizationRoleOf(member),
        storeIdsOf(member)
      );
    } catch (ApiException error) {
      if (error.status() != 401) throw error;
      return new SessionView("cognito", false, null, null, null, null, null, null, List.of());
    }
  }

  /** オーナーなら自分の組織。子アカウントなら、担当している店舗の組織。 */
  public Long organizationIdOf(AuthMember member) {
    if (AuthMember.SHOP_OWNER.equals(member.getAccountType())) {
      return organizations.findByOwnerMemberId(member.getId()).map(OrganizationEntity::getId).orElse(null);
    }
    if (AuthMember.SHOP_STAFF.equals(member.getAccountType())) {
      return organizationMembers
        .findForMember(member.getId())
        .map(m -> m.getId().getOrganizationId())
        .orElse(null);
    }
    return null;
  }

  /** 担当者の人事のロール（ORG_ADMIN か空）。オーナー・購入者・運営は空。 */
  public String organizationRoleOf(AuthMember member) {
    if (!AuthMember.SHOP_STAFF.equals(member.getAccountType())) return null;
    return organizationMembers.findForMember(member.getId()).map(OrganizationMemberEntity::getRole).orElse(null);
  }

  /**
   * 出店者画面の店舗の候補。オーナーは組織の全店舗、ORG_ADMIN は組織の全店舗（ロールのない店舗では人事の画面だけ、#112）、
   * ほかの担当者は所属する店舗（ロール未割り当てを含む）。
   */
  public List<Long> candidateStoreIdsOf(AuthMember member) {
    if (OrganizationMemberEntity.ORG_ADMIN.equals(organizationRoleOf(member))) {
      Long organizationId = organizationIdOf(member);
      if (organizationId != null) return stores
        .findByOrganizationIdOrderByIdAsc(organizationId)
        .stream()
        .map(StoreEntity::getId)
        .toList();
    }
    return viewableStoreIdsOf(member);
  }

  /** その店舗での自分の立場。OWNER・MANAGER・STAFF・NONE（所属でロールなし）、担当でなければ空。運営は ADMIN。 */
  public String memberRoleAt(AuthMember member, StoreEntity store) {
    if (member.isAdmin()) return AuthMember.ADMIN;
    if (AuthMember.SHOP_OWNER.equals(member.getAccountType())) {
      return store.getOrganizationId().equals(organizationIdOf(member)) ? "OWNER" : null;
    }
    if (!AuthMember.SHOP_STAFF.equals(member.getAccountType())) return null;
    return storeMembers
      .findById(new StoreMemberId(store.getId(), member.getId()))
      .map(assignment -> assignment.getRole() == null ? "NONE" : assignment.getRole())
      .orElse(null);
  }

  /** その会員が操作できる店舗。オーナーは組織の全店舗、子アカウントはロールが割り振られた担当の店舗。 */
  public List<Long> storeIdsOf(AuthMember member) {
    if (AuthMember.SHOP_OWNER.equals(member.getAccountType())) {
      Long organizationId = organizationIdOf(member);
      if (organizationId == null) return List.of();
      return stores.findByOrganizationIdOrderByIdAsc(organizationId).stream().map(StoreEntity::getId).toList();
    }
    if (AuthMember.SHOP_STAFF.equals(member.getAccountType())) {
      return storeMembers
        .findAllForMember(member.getId())
        .stream()
        .filter(assignment -> assignment.getRole() != null)
        .map(assignment -> assignment.getId().getStoreId())
        .toList();
    }
    return List.of();
  }

  /** 店舗の情報と、出店者の商品一覧・在庫を見られる店舗。子アカウントはロール未割り当ての所属店舗も含む。 */
  public List<Long> viewableStoreIdsOf(AuthMember member) {
    if (!AuthMember.SHOP_STAFF.equals(member.getAccountType())) return storeIdsOf(member);
    return storeMembers
      .findAllForMember(member.getId())
      .stream()
      .map(assignment -> assignment.getId().getStoreId())
      .toList();
  }

  /**
   * 購入者として、カート・注文・庭の買い物リストを使えるか。使えるのは購入者（USER）と運営（ADMIN）だけ。
   * 店舗側のアカウント（オーナー・子アカウント）と申請中のアカウントは購入できない（#108）。
   */
  public AuthMember requireBuyer() {
    var member = current();
    if (!AuthMember.USER.equals(member.getAccountType()) && !member.isAdmin()) throw new ApiException(
      403,
      "BUYER_REQUIRED",
      "店舗・出店申請用のアカウントでは購入できません。購入者のアカウントでご利用ください。"
    );
    return member;
  }

  /** 店舗の情報と、出店者の商品一覧・在庫を見られるか（GET だけ）。ロール未割り当ての担当者も、所属店舗なら見られる（#105）。 */
  public void requireStoreViewer(Long storeId) {
    if (!enabled()) return;
    if (!canManageView(current(), storeId == null ? null : stores.findById(storeId).orElse(null))) denied();
  }

  /**
   * 店舗の公開ページを、店舗側の立場（オーナー・担当者・運営）で見られるか。ログインしていなければ false。
   * 運営が停止した店舗は、ほかの操作と同じく運営だけが見られる。
   */
  @Transactional(readOnly = true)
  public boolean canViewAsStaff(StoreEntity store) {
    if (!enabled()) return true;
    try {
      return canManageView(current(), store);
    } catch (ApiException error) {
      if (error.status() == 401 || error.status() == 403) return false;
      throw error;
    }
  }

  private boolean canManageView(AuthMember member, StoreEntity store) {
    if (member.isAdmin()) return true;
    if (store == null || store.isSuspended()) return false;
    if (AuthMember.SHOP_OWNER.equals(member.getAccountType())) {
      var organization = organizations.findByOwnerMemberId(member.getId()).orElse(null);
      return organization != null && organization.getId().equals(store.getOrganizationId());
    }
    return (
      AuthMember.SHOP_STAFF.equals(member.getAccountType()) &&
      storeMembers.existsById(new StoreMemberId(store.getId(), member.getId()))
    );
  }

  /** 店舗の商品・在庫・注文を扱えるか（STAFF 以上）。運営が停止した店舗は、運営だけが扱える。 */
  public void requireSeller(Long storeId) {
    requireStoreRole(storeId, false);
  }

  /** 店舗の情報の編集、商品の登録・削除、キャンセルへの対応ができるか（オーナーか MANAGER）。商品の編集は STAFF もできる。 */
  public void requireManager(Long storeId) {
    requireStoreRole(storeId, true);
  }

  private void requireStoreRole(Long storeId, boolean managerOnly) {
    if (!enabled()) return;
    var member = current();
    if (member.isAdmin()) return;
    var store = storeId == null ? null : stores.findById(storeId).orElse(null);
    if (store == null || store.isSuspended()) denied();
    if (AuthMember.SHOP_OWNER.equals(member.getAccountType())) {
      var organization = organizations.findByOwnerMemberId(member.getId()).orElse(null);
      if (organization == null || !organization.getId().equals(store.getOrganizationId())) denied();
      return;
    }
    if (!AuthMember.SHOP_STAFF.equals(member.getAccountType())) denied();
    String role = storeMembers
      .findById(new StoreMemberId(storeId, member.getId()))
      .map(StoreMemberEntity::getRole)
      .orElse(null);
    if (role == null || (managerOnly && !StoreMemberEntity.MANAGER.equals(role))) denied();
  }

  /** 自分の組織を返す。オーナーでなければ拒否する。 */
  public OrganizationEntity requireOwnedOrganization() {
    var member = current();
    if (!AuthMember.SHOP_OWNER.equals(member.getAccountType())) denied();
    return organizations
      .findByOwnerMemberId(member.getId())
      .orElseThrow(() -> new ApiException(403, "FORBIDDEN", "この操作の権限がありません。"));
  }

  /** その店舗が、自分がオーナーの組織の店舗か。 */
  public void requireOwnerOf(StoreEntity store) {
    if (!enabled()) return;
    if (!requireOwnedOrganization().getId().equals(store.getOrganizationId())) denied();
  }

  public void requireAdmin() {
    if (enabled() && !current().isAdmin()) denied();
  }

  /** 店舗側のアカウント（オーナー・子アカウント）か、運営か。 */
  public void requireSellerRole() {
    if (!enabled()) return;
    String type = current().getAccountType();
    if (!List.of(AuthMember.SHOP_OWNER, AuthMember.SHOP_STAFF, AuthMember.ADMIN).contains(type)) denied();
  }

  /** 商品の店舗を扱えなければ、商品がないものとして返す（ほかの店舗の商品の有無を知らせない）。 */
  public void requireProductStore(Long storeId, boolean managerOnly) {
    if (!enabled()) return;
    try {
      requireStoreRole(storeId, managerOnly);
    } catch (ApiException error) {
      if (error.status() != 403) throw error;
      throw new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。");
    }
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
    String accountType,
    Long organizationId,
    String organizationRole,
    List<Long> storeIds
  ) {}
}
