package jp.kusakari.ec.store.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthMemberRepository;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEntity;
import jp.kusakari.ec.store.persistence.entity.StoreInvitationEntity;
import jp.kusakari.ec.store.persistence.entity.StoreInvitationUseEntity;
import jp.kusakari.ec.store.persistence.entity.StoreMemberEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import jp.kusakari.ec.store.persistence.repository.StoreInvitationRepository;
import jp.kusakari.ec.store.persistence.repository.StoreInvitationUseRepository;
import jp.kusakari.ec.store.persistence.repository.StoreMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 店舗の招待キー（#111、#105）。キーは 32 バイトの乱数（URL で使える Base64、43 文字）で、DB には SHA-256 だけを保存する。
 * 有効期限は発行から30日。1回限りか、期限内なら何回でもかを発行時に選ぶ。
 */
@Service
@RequiredArgsConstructor
@Transactional
public class StoreInvitationService {

  public static final Duration VALIDITY = Duration.ofDays(30);
  public static final String KEY_PATTERN = "[A-Za-z0-9_-]{43}";
  private static final SecureRandom RANDOM = new SecureRandom();

  private final StaffPolicy policy;
  private final StoreRepository stores;
  private final OrganizationRepository organizations;
  private final StoreInvitationRepository invitations;
  private final StoreInvitationUseRepository uses;
  private final OrganizationMemberRepository organizationMembers;
  private final StoreMemberRepository storeMembers;
  private final AuthMemberRepository members;

  public record User(String memberId, String name, String email, Instant usedAt) {}

  /** status は ACTIVE・EXPIRED・REVOKED・USED_UP。 */
  public record Invitation(
    String id,
    long storeId,
    Instant createdAt,
    Instant expiresAt,
    Integer maxUses,
    Instant revokedAt,
    String status,
    List<User> users
  ) {}

  /** 発行した直後だけ、キーそのものを返す（DB に残らないので、後から表示できない）。 */
  public record Issued(String id, long storeId, String key, Instant expiresAt, Integer maxUses) {}

  public Issued issue(long storeId, boolean singleUse) {
    var viewer = policy.viewer();
    var store = storeOf(viewer, storeId);
    if (store.getClosedAt() != null || store.isSuspended()) throw new ApiException(
      409,
      "STORE_NOT_INVITABLE",
      "停止中・閉鎖済みの店舗には招待できません。"
    );
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    String key = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    var invitation = new StoreInvitationEntity(
      store.getId(),
      viewer.memberId(),
      hash(key),
      Instant.now().plus(VALIDITY),
      singleUse ? 1 : null
    );
    invitations.saveAndFlush(invitation);
    return new Issued(invitation.getId(), store.getId(), key, invitation.getExpiresAt(), invitation.getMaxUses());
  }

  @Transactional(readOnly = true)
  public List<Invitation> list(long storeId) {
    var viewer = policy.viewer();
    storeOf(viewer, storeId);
    var issued = invitations.findByStoreIdOrderByCreatedAtDesc(storeId);
    var usedBy = uses
      .findForInvitations(issued.stream().map(StoreInvitationEntity::getId).toList())
      .stream()
      .collect(Collectors.groupingBy(use -> use.getId().getInvitationId()));
    Instant now = Instant.now();
    return issued
      .stream()
      .map(invitation -> {
        var users = usedBy
          .getOrDefault(invitation.getId(), List.of())
          .stream()
          .map(use -> {
            var member = members.findById(use.getId().getMemberId()).orElse(null);
            return new User(
              use.getId().getMemberId(),
              member == null ? "" : member.getDisplayName(),
              member == null ? "" : member.getEmail(),
              use.getUsedAt()
            );
          })
          .toList();
        return new Invitation(
          invitation.getId(),
          invitation.getStoreId(),
          invitation.getCreatedAt(),
          invitation.getExpiresAt(),
          invitation.getMaxUses(),
          invitation.getRevokedAt(),
          status(invitation, users.size(), now),
          users
        );
      })
      .toList();
  }

  /** 取り消しても、すでに使った人の所属は変わらない。 */
  public void revoke(String invitationId) {
    var viewer = policy.viewer();
    var invitation = invitations
      .findById(invitationId)
      .orElseThrow(() -> new ApiException(404, "INVITATION_NOT_FOUND", "招待キーが見つかりません。"));
    storeOf(viewer, invitation.getStoreId());
    invitation.revoke();
    invitations.flush();
  }

  /**
   * 招待キーでの新規登録。キーの行をロックして使えるかを確かめてから Cognito に登録し、同じトランザクションで
   * 会員（SHOP_STAFF）・組織への所属・店舗の担当（ロールなし）・使用記録を作る。キーが使えなければ Cognito に登録しない。
   * Cognito の登録の後で DB の保存に失敗すると、Cognito に未確認のユーザーだけが残る（会員は作られない）。
   */
  public void register(String key, String issuer, String email, Supplier<String> signUp) {
    var invitation = invitations.lockByKeyHash(hash(key)).orElseThrow(StoreInvitationService::invalid);
    if (!invitation.usable(Instant.now(), uses.countForInvitation(invitation.getId()))) throw invalid();
    StoreEntity store = stores.findById(invitation.getStoreId()).orElseThrow(StoreInvitationService::invalid);
    var organization = organizations.findById(store.getOrganizationId()).orElseThrow(StoreInvitationService::invalid);
    if (store.getClosedAt() != null || store.isSuspended() || organization.isSuspended()) throw invalid();
    String subject = signUp.get();
    if (members.findByIssuerAndSubject(issuer, subject).isPresent()) throw invalid();
    var member = new AuthMember(
      issuer,
      subject,
      email,
      email.substring(0, Math.min(email.length(), 120)),
      AuthMember.SHOP_STAFF
    );
    members.saveAndFlush(member);
    organizationMembers.saveAndFlush(new OrganizationMemberEntity(store.getOrganizationId(), member.getId()));
    storeMembers.save(new StoreMemberEntity(store.getId(), member.getId(), store.getOrganizationId(), null));
    uses.save(new StoreInvitationUseEntity(invitation.getId(), member.getId()));
    uses.flush();
  }

  private StoreEntity storeOf(StaffPolicy.Viewer viewer, long storeId) {
    var store = stores
      .findById(storeId)
      .filter(candidate -> candidate.getOrganizationId().equals(viewer.organizationId()))
      .orElseThrow(() -> new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。"));
    if (!viewer.canInvite(storeId)) throw StaffPolicy.denied();
    return store;
  }

  private static String status(StoreInvitationEntity invitation, int used, Instant now) {
    if (invitation.getRevokedAt() != null) return "REVOKED";
    if (!invitation.getExpiresAt().isAfter(now)) return "EXPIRED";
    if (invitation.getMaxUses() != null && used >= invitation.getMaxUses()) return "USED_UP";
    return "ACTIVE";
  }

  private static ApiException invalid() {
    return new ApiException(
      400,
      "INVITATION_INVALID",
      "招待キーが無効です。期限切れ・取り消し済み・使用済みのキーは使えません。店舗の管理者に新しいキーを依頼してください。"
    );
  }

  static String hash(String key) {
    try {
      var digest = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.US_ASCII));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException(error);
    }
  }
}
