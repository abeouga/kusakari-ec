package jp.kusakari.ec.store.persistence.repository;

import jakarta.persistence.LockModeType;
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

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select o from OrganizationEntity o where o.id = :id")
  Optional<OrganizationEntity> lock(@Param("id") Long id);

  // お会計は、店舗の行のあと在庫の前に、組織の行を共有ロックで読む。受付停止と同時のお会計で、
  // 受付停止の後に注文ができて、未完了の注文がないまま停止になることを防ぐ。
  @Lock(LockModeType.PESSIMISTIC_READ)
  @Query("select o from OrganizationEntity o where o.id in :ids order by o.id")
  List<OrganizationEntity> lockShared(@Param("ids") Collection<Long> ids);
}
