package jp.kusakari.ec.catalog.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StoreRepository extends JpaRepository<StoreEntity, Long> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select s from StoreEntity s where s.id=:id")
  Optional<StoreEntity> lock(@Param("id") Long id);

  List<StoreEntity> findAllByOrderByIdAsc();

  List<StoreEntity> findByOrganizationIdOrderByIdAsc(Long organizationId);

  boolean existsByOrganizationIdAndName(Long organizationId, String name);

  // 購入者に見せる店舗：公開されていて、停止・閉鎖されておらず、組織が受付停止中・停止でない。
  @Query(
    "select s from StoreEntity s where s.published = true and s.suspended = false and s.closingStartedAt is null " +
      "and exists (select o.id from OrganizationEntity o where o.id = s.organizationId and o.suspensionStartedAt is null) " +
      "order by s.id"
  )
  List<StoreEntity> findOpen();
}
