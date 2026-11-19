package jp.kusakari.ec.store.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Duration;
import java.time.Instant;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthMemberRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEventEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberId;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberEventRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * オーナーの譲渡（決定は #181・#194・#195・#196・#197）。オーナーが申し出て取り消し（#203）、譲渡先が承認するか断る（#204）。
 * 譲渡先は同じ組織の担当者のうち、除名中・停止中・退会済みでない人で、ロールの制限はない。
 * 同時に申し出られるのは 1 人だけで、期限は申し出た時刻＋30 分。期限が過ぎた申し出は残っていないものとして扱う。
 * 承認した時点でオーナーが入れ替わり、移行期間も元に戻す操作もない（#197）。知らせるのは店舗専用ページの通知だけ（{@link OwnerSuccessionNotices}）。
 * 組織の行を先にロックし、所属（organization_members）、会員（members）の順にロックする（逆にするとデッドロックしうる）。
 */
@Service
@RequiredArgsConstructor
@Transactional
public class OwnerSuccessionService {

  private static final Duration APPROVAL_PERIOD = Duration.ofMinutes(30);
  private static final String NOT_PENDING = "あなたあての、承認を待っているオーナーの譲渡の申し出はありません。";

  private final StaffPolicy policy;
  private final PendingOwnerSuccession pending;
  private final OrganizationMemberRepository organizationMembers;
  private final AuthMemberRepository members;
  private final OrganizationMemberEventRepository events;
  private final OwnerSuccessionNotices notices;
  private final StaffAccountService accounts;
  private final EntityManager entityManager;

  /** 承認・断りの結果。owner は、操作した人が今この組織のオーナーか（承認なら真、断りなら偽）。 */
  public record Decision(long organizationId, String organizationName, boolean owner) {}

  /**
   * 期限切れの申し出への承認・断り。期限切れを「自動で無効」として記録した後に断るので、この例外ではトランザクションを巻き戻さない。
   * 投げるのは記録のほかに何も書いていない時点だけにする。
   */
  private static final class Lapsed extends ApiException {

    Lapsed(String code, String message) {
      super(409, code, message);
    }
  }

  /**
   * 譲渡を申し出る。組織の行をロックしてから、期限が過ぎた申し出を先に無効として記録し（#194 の 16）、
   * 承認待ちが残っていなければ受け付けて、譲渡先に「譲渡の申し出」の通知を送る。
   */
  public StaffAccountService.AccountsView request(String memberId) {
    var viewer = ownerOnly();
    OrganizationEntity organization = pending.lock(viewer.organizationId());
    pending.expireIfDue(organization);
    // 期限切れはここまでに空に戻っているので、残っているのは期限内の申し出だけ（時刻を取り直して判定を食い違わせない）。
    if (organization.getPendingOwnerMemberId() != null) {
      throw new ApiException(
        409,
        "OWNER_SUCCESSION_PENDING",
        "承認を待っている譲渡の申し出があります。取り消すか、期限が過ぎてから申し出てください。"
      );
    }
    AuthMember successor = successorOf(organization, memberId);
    Instant expiresAt = Instant.now().plus(APPROVAL_PERIOD);
    organization.requestOwnerSuccession(successor.getId(), expiresAt);
    record(organization, OrganizationMemberEventEntity.OWNER_SUCCESSION_REQUEST, viewer.memberId(), successor.getId());
    notices.requested(organization, successor.getId(), expiresAt);
    events.flush();
    return accounts.list();
  }

  /**
   * 承認される前の申し出を取り消し（#194 の 5）、オーナーと譲渡先の両方に知らせる（#200 の決めること 1）。
   * 期限が過ぎた申し出は、取り消せるものとして扱わない。
   */
  public StaffAccountService.AccountsView cancel() {
    var viewer = ownerOnly();
    OrganizationEntity organization = pending.lock(viewer.organizationId());
    if (!organization.hasPendingOwnerSuccession(Instant.now())) {
      throw new ApiException(409, "OWNER_SUCCESSION_NOT_PENDING", "承認を待っている譲渡の申し出はありません。");
    }
    String successor = organization.getPendingOwnerMemberId();
    organization.clearOwnerSuccession();
    record(organization, OrganizationMemberEventEntity.OWNER_SUCCESSION_CANCELLATION, viewer.memberId(), successor);
    notices.cancelled(organization, successor);
    events.flush();
    return accounts.list();
  }

  /**
   * 譲渡先が承認し、1 つのトランザクションで新旧のオーナーを入れ替える（#197 の 8）。
   * 新しいオーナーは組織の所属と店舗の担当から外れ（#195 の 1・2・4）、元のオーナーは子アカウントの ORG_ADMIN になる（#195 の 5）。
   * 外部キーと CHECK にぶつからないよう、決まった順番で 1 段ずつ DB に書く。承認の記録が交代の記録を兼ねる（#196）。
   */
  @Transactional(noRollbackFor = Lapsed.class)
  public Decision approve() {
    var viewer = policy.viewer();
    OrganizationEntity organization = addressedTo(viewer);
    // 承認待ちの間に除名・停止・退会が確定していないかを、所属と会員の行をロックしてから確かめる（#194 の 7・13）。
    OrganizationMemberEntity membership = lockMembership(organization.getId(), viewer.memberId());
    AuthMember successor = lockMember(viewer.memberId());
    if (membership.isExpelled() || !successor.isEnabled() || successor.getWithdrawnAt() != null) {
      throw new ApiException(
        409,
        "OWNER_SUCCESSION_TARGET_UNAVAILABLE",
        "除名中・停止中・退会済みのアカウントは、オーナーの譲渡を承認できません。"
      );
    }
    AuthMember previousOwner = lockMember(organization.getOwnerMemberId());

    // 1. 新しいオーナーの所属を外す。店舗の担当（store_members）は ON DELETE CASCADE で一緒に消える。
    organizationMembers.delete(membership);
    entityManager.flush();
    // 2〜3. 会員の種別を SHOP_OWNER にしてから、組織のオーナーを付け替える（組織の複合外部キーが種別を見る）。
    successor.becomeOwner();
    entityManager.flush();
    organization.changeOwner(successor.getId());
    entityManager.flush();
    // 4〜5. 組織から外れた元のオーナーを子アカウントにしてから、ORG_ADMIN として所属させる（所属の複合外部キーが種別を見る）。
    previousOwner.becomeStaff();
    entityManager.flush();
    var admin = new OrganizationMemberEntity(organization.getId(), previousOwner.getId());
    admin.changeRole(OrganizationMemberEntity.ORG_ADMIN);
    organizationMembers.save(admin);
    entityManager.flush();
    // 6〜7. 承認待ちを空に戻し、承認を記録する。操作した人も操作された人も新しいオーナー。
    organization.clearOwnerSuccession();
    record(organization, OrganizationMemberEventEntity.OWNER_SUCCESSION_APPROVAL, successor.getId(), successor.getId());
    notices.approved(organization, successor, previousOwner);
    entityManager.flush();
    return new Decision(organization.getId(), organization.getName(), true);
  }

  /**
   * 譲渡先が断る（#194 の 6）。承認待ちを空に戻し、断りを記録する。
   * 断ったことを誰に知らせるかは決まっていないので（#200 の決めること 1）、通知は送らない。
   */
  @Transactional(noRollbackFor = Lapsed.class)
  public Decision refuse() {
    var viewer = policy.viewer();
    OrganizationEntity organization = addressedTo(viewer);
    organization.clearOwnerSuccession();
    record(organization, OrganizationMemberEventEntity.OWNER_SUCCESSION_REFUSAL, viewer.memberId(), viewer.memberId());
    events.flush();
    return new Decision(organization.getId(), organization.getName(), false);
  }

  /**
   * 操作する人が今の譲渡先である組織を、ロックして返す。組織は所属から決まる（担当者は 1 人 1 組織）。
   * 期限が過ぎていれば「自動で無効」として記録してから断る（#194 の 15・16）。
   * 組織の受付停止中・停止中でも止めない（#200 の決めること 2。停止は注文を止めるためのもので、組織の中の人の管理は止めないため）。
   */
  private OrganizationEntity addressedTo(StaffPolicy.Viewer viewer) {
    OrganizationEntity organization = pending.lock(viewer.organizationId());
    boolean addressed = viewer.memberId().equals(organization.getPendingOwnerMemberId());
    if (pending.expireIfDue(organization)) {
      if (addressed) throw new Lapsed(
        "OWNER_SUCCESSION_EXPIRED",
        "承認の期限が過ぎたため、このオーナーの譲渡の申し出は無効になりました。"
      );
      throw new Lapsed("OWNER_SUCCESSION_NOT_PENDING", NOT_PENDING);
    }
    if (!addressed) throw new ApiException(409, "OWNER_SUCCESSION_NOT_PENDING", NOT_PENDING);
    return organization;
  }

  private StaffPolicy.Viewer ownerOnly() {
    var viewer = policy.viewer();
    if (!viewer.canHandOverOwnership()) throw StaffPolicy.denied();
    return viewer;
  }

  /**
   * 譲渡先にできる人（#181 の 2）。所属と会員の行をロックして読み、同時に進む除名・停止・退会の確定を待ってから確かめる。
   * オーナー本人と別の組織の会員は、organization_members に行がないので見つからない。
   */
  private AuthMember successorOf(OrganizationEntity organization, String memberId) {
    var membership = organizationMembers
      .lockShared(organization.getId(), memberId)
      .orElseThrow(() -> new ApiException(404, "ACCOUNT_NOT_FOUND", "アカウントが見つかりません。"));
    var member = members
      .lockMember(memberId)
      .orElseThrow(() -> new ApiException(404, "ACCOUNT_NOT_FOUND", "アカウントが見つかりません。"));
    if (membership.isExpelled() || !member.isEnabled() || member.getWithdrawnAt() != null) {
      throw new ApiException(
        409,
        "OWNER_SUCCESSION_TARGET_UNAVAILABLE",
        "除名中・停止中・退会済みのアカウントは、譲渡先にできません。"
      );
    }
    return member;
  }

  /**
   * 所属の行を PESSIMISTIC_WRITE でロックし、DB の今の値で読み直す。
   * 権限の確認（{@link StaffPolicy#viewer}）で読み込み済みなので、ロックするクエリだけでは古い値のままになるため。
   */
  private OrganizationMemberEntity lockMembership(long organizationId, String memberId) {
    var membership = organizationMembers
      .findById(new OrganizationMemberId(organizationId, memberId))
      .orElseThrow(() -> new ApiException(409, "OWNER_SUCCESSION_NOT_PENDING", NOT_PENDING));
    entityManager.refresh(membership, LockModeType.PESSIMISTIC_WRITE);
    return membership;
  }

  /** 会員の行を PESSIMISTIC_WRITE でロックし、DB の今の値で読み直す（ログイン中の本人は読み込み済みのため）。 */
  private AuthMember lockMember(String memberId) {
    var member = members
      .findById(memberId)
      .orElseThrow(() -> new ApiException(404, "ACCOUNT_NOT_FOUND", "アカウントが見つかりません。"));
    entityManager.refresh(member, LockModeType.PESSIMISTIC_WRITE);
    return member;
  }

  private void record(OrganizationEntity organization, String eventType, String actorId, String targetId) {
    events.save(OrganizationMemberEventEntity.ofOwnerSuccession(organization.getId(), eventType, actorId, targetId));
  }
}
