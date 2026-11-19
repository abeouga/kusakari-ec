package jp.kusakari.ec.store.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEventEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberEventRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * オーナーの譲渡の承認待ち（organizations.pending_owner_*）を、自動で無効にする処理の置き場所（#194 の 15・16、#196 の 5・6）。
 * 期限切れは定期処理で調べず、次の操作のときにここを呼んで見つける。
 * 呼ぶところ：申し出の API・アカウント一覧の GET・通知一覧の読み込み（#203）、承認・断りの前（#204）。
 * 譲渡先の除名・停止・退会での無効（#205）は、組織の行を {@link #lock} してから {@link #invalidate} を呼ぶ。
 * 呼ぶ側のトランザクションの中で動く。
 */
@Component
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class PendingOwnerSuccession {

  private final OrganizationRepository organizations;
  private final OrganizationMemberEventRepository events;
  private final EntityManager entityManager;

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

  /** 期限が過ぎた申し出が残っていれば、無効として記録する。ロック済みの組織に使う。無効にしたら真。 */
  public boolean expireIfDue(OrganizationEntity locked) {
    if (!locked.hasExpiredOwnerSuccession(Instant.now())) return false;
    invalidate(locked);
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
   * 承認待ちを空に戻し、OWNER_SUCCESSION_AUTO_INVALIDATED を記録する。ロック済みの組織に使う。
   * 操作した人は申し出たオーナー、操作された人は譲渡先（#196 の 6）。期限切れのほか、譲渡先の除名・停止・退会でも使う（#196 の 5）。
   */
  public void invalidate(OrganizationEntity locked) {
    String successor = locked.getPendingOwnerMemberId();
    if (successor == null) return;
    locked.clearOwnerSuccession();
    events.save(
      OrganizationMemberEventEntity.ofOwnerSuccession(
        locked.getId(),
        OrganizationMemberEventEntity.OWNER_SUCCESSION_AUTO_INVALIDATED,
        locked.getOwnerMemberId(),
        successor
      )
    );
  }
}
