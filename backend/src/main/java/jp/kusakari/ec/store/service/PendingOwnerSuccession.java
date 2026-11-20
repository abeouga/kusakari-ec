package jp.kusakari.ec.store.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEventEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberEventRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * オーナーの譲渡の承認待ち（organizations.pending_owner_*）を、自動で無効にする処理の置き場所（#194 の 15・16、#196 の 5・6）。
 * 期限切れは定期処理で調べず、次の操作のときにここを呼んで見つける。
 * 呼ぶところ：申し出の API・アカウント一覧の GET・通知一覧の読み込み（#203）、承認・断りの前（#204）。
 * 譲渡先の除名・停止・退会と、申し出たオーナー本人の停止・退会（#205）は、所属・会員の行を書き換える前に組織の行を {@link #lock} し、
 * 最後に {@link #invalidateFor}・{@link #invalidateForOwner} を呼ぶ。
 * ロックの順番は「店舗 → 組織 → 所属 → 会員」にそろえる（申し出・承認・注文の確定と同じ向き。逆にするとデッドロックしうる）。
 * 無効にしたら、なぜ無効になったか（{@link Reason}）を、オーナーと譲渡先の両方に「譲渡の結果」の通知で知らせる（#200 の決めること 1）。
 * 呼ぶ側のトランザクションの中で動く。
 */
@Component
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class PendingOwnerSuccession {

  private final OrganizationRepository organizations;
  private final OrganizationMemberRepository organizationMembers;
  private final OrganizationMemberEventRepository events;
  private final OwnerSuccessionNotices notices;
  private final EntityManager entityManager;

  /** 申し出が自動で無効になった理由。通知の文面で使う。 */
  public enum Reason {
    /** 承認の期限（申し出から 30 分）が過ぎた。 */
    EXPIRED,
    /** 譲渡先が組織から除名された。 */
    SUCCESSOR_EXPELLED,
    /** 譲渡先の利用が運営に停止された。 */
    SUCCESSOR_DISABLED,
    /** 譲渡先が退会した。 */
    SUCCESSOR_WITHDRAWN,
    /** 申し出たオーナーの利用が運営に停止された。 */
    OWNER_DISABLED,
    /** 申し出たオーナーが退会した。 */
    OWNER_WITHDRAWN,
  }

  /**
   * 組織の行を PESSIMISTIC_WRITE でロックし、DB の今の値で読み直す。
   * 権限の確認（{@link StaffPolicy#viewer}）で同じ組織を読み込み済みのことがあり、ロックするクエリだけでは古い値のままになるため。
   */
  public OrganizationEntity lock(long organizationId) {
    var organization = organizations
      .findById(organizationId)
      .orElseThrow(() -> new ApiException(404, "ORGANIZATION_NOT_FOUND", "組織が見つかりません。"));
    entityManager.refresh(organization, LockModeType.PESSIMISTIC_WRITE);
    return organization;
  }

  /**
   * 会員がオーナーか担当者として属する組織の行をロックする。どちらでもなければ空（購入者・運営）。
   * 組織の ID はロックせずに読む。属する組織は変わらない（譲渡の承認でオーナーと担当者が入れ替わっても、同じ組織のまま）。
   * 承認待ちの当事者かどうかは、ロックして読み直した組織の行で {@link #invalidateFor}・{@link #invalidateForOwner} が確かめる。
   * オーナーの退会では、呼ぶ前に組織の店舗の行をロックしておく（店舗 → 組織の順。注文の確定と同じ向き）。
   */
  public Optional<OrganizationEntity> lockOrganizationOf(String memberId) {
    return organizations
      .findByOwnerMemberId(memberId)
      .map(OrganizationEntity::getId)
      .or(() -> organizationMembers.findForMember(memberId).map(membership -> membership.getId().getOrganizationId()))
      .map(this::lock);
  }

  /**
   * 承認待ちの譲渡先がその会員なら、申し出を無効にする（#205。譲渡先の除名・停止・退会、#194 の 7・13・14）。ロック済みの組織に使う。
   * 期限が過ぎていた申し出も、ここで 1 回だけ記録する（{@link #invalidate} が承認待ちを空に戻すので、期限切れとして重ねて記録されない）。
   * そのときの理由は期限切れにする。除名などの前に、申し出はもう残っていないものになっていたため（#194 の 16）。
   */
  public void invalidateFor(OrganizationEntity locked, String memberId, Reason reason) {
    if (!memberId.equals(locked.getPendingOwnerMemberId())) return;
    invalidate(locked, locked.hasExpiredOwnerSuccession(Instant.now()) ? Reason.EXPIRED : reason);
  }

  /**
   * 申し出たオーナーがその会員で、承認待ちがあれば、申し出を無効にする（#205 の追加分。オーナー本人の停止・退会、#200 の決めること 5）。
   * ロック済みの組織に使う。期限が過ぎていた申し出は、{@link #invalidateFor} と同じく理由を期限切れにする。
   */
  public void invalidateForOwner(OrganizationEntity locked, String memberId, Reason reason) {
    if (!memberId.equals(locked.getOwnerMemberId())) return;
    invalidate(locked, locked.hasExpiredOwnerSuccession(Instant.now()) ? Reason.EXPIRED : reason);
  }

  /** 期限が過ぎた申し出が残っていれば、無効として記録する。ロック済みの組織に使う。無効にしたら真。 */
  public boolean expireIfDue(OrganizationEntity locked) {
    if (!locked.hasExpiredOwnerSuccession(Instant.now())) return false;
    invalidate(locked, Reason.EXPIRED);
    return true;
  }

  /** 一覧の読み込み用。期限が過ぎた申し出が残っているときだけ組織の行をロックし、確かめ直してから無効にする。 */
  public void expireIfDue(long organizationId) {
    if (organizations.existsByIdAndPendingOwnerExpiresAtLessThanEqual(organizationId, Instant.now())) {
      expireIfDue(lock(organizationId));
    }
  }

  /** 通知一覧の読み込み用。その人がオーナーか譲渡先の組織で、期限が過ぎた申し出を無効にする。 */
  public void expireIfDueFor(String memberId) {
    organizations.findIdsWithExpiredOwnerSuccession(memberId, Instant.now()).forEach(this::expireIfDue);
  }

  /**
   * 承認待ちを空に戻し、OWNER_SUCCESSION_AUTO_INVALIDATED を記録して、オーナーと譲渡先に理由と一緒に知らせる。ロック済みの組織に使う。
   * 操作した人は申し出たオーナー、操作された人は譲渡先（#196 の 6）。除名した人が ORG_ADMIN でも、操作した人はオーナーにする。
   * 期限切れのほか、譲渡先の除名・停止・退会（#196 の 5。{@link #invalidateFor}）と、オーナー本人の停止・退会（{@link #invalidateForOwner}）でも使う。
   */
  public void invalidate(OrganizationEntity locked, Reason reason) {
    String successor = locked.getPendingOwnerMemberId();
    if (successor == null) return;
    Instant expiresAt = locked.getPendingOwnerExpiresAt();
    locked.clearOwnerSuccession();
    events.save(
      OrganizationMemberEventEntity.ofOwnerSuccession(
        locked.getId(),
        OrganizationMemberEventEntity.OWNER_SUCCESSION_AUTO_INVALIDATED,
        locked.getOwnerMemberId(),
        successor
      )
    );
    notices.invalidated(locked, successor, expiresAt, reason);
  }
}
