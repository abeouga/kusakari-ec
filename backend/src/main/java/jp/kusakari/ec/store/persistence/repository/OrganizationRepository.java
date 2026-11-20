package jp.kusakari.ec.store.persistence.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrganizationRepository extends JpaRepository<OrganizationEntity, Long> {
  Optional<OrganizationEntity> findByOwnerMemberId(String ownerMemberId);

  List<OrganizationEntity> findAllByOrderByIdAsc();

  /** 期限が過ぎた譲渡の申し出が残っているか（#194 の 15）。ロックせずに読み、残っていたときだけロックして確かめ直す。 */
  boolean existsByIdAndPendingOwnerExpiresAtLessThanEqual(Long id, Instant now);

  /** その人あての、期限内の譲渡の申し出があるか（通知一覧で、申し出の通知に承認・断りのボタンを出すかを決める。#204）。 */
  boolean existsByPendingOwnerMemberIdAndPendingOwnerExpiresAtAfter(String memberId, Instant now);

  /** その人がオーナーか譲渡先で、期限が過ぎた申し出が残っている組織（通知一覧の読み込みで使う）。 */
  @Query(
    "select o.id from OrganizationEntity o where (o.ownerMemberId = :memberId or o.pendingOwnerMemberId = :memberId)" +
      " and o.pendingOwnerExpiresAt <= :now"
  )
  List<Long> findIdsWithExpiredOwnerSuccession(@Param("memberId") String memberId, @Param("now") Instant now);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select o from OrganizationEntity o where o.id = :id")
  Optional<OrganizationEntity> lock(@Param("id") Long id);

  // お会計は、店舗の行のあと在庫の前に、組織の行を共有ロックで読む。受付停止と同時のお会計で、
  // 受付停止の後に注文ができて、未完了の注文がないまま停止になることを防ぐ。
  @Lock(LockModeType.PESSIMISTIC_READ)
  @Query("select o from OrganizationEntity o where o.id in :ids order by o.id")
  List<OrganizationEntity> lockShared(@Param("ids") Collection<Long> ids);
}
