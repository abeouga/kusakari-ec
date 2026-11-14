package jp.kusakari.ec.catalog.persistence.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
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

  // 閉鎖中（閉鎖を始めていて、まだ閉鎖済みでない）の店舗。
  @Query("select s.id from StoreEntity s where s.closingStartedAt is not null and s.closedAt is null order by s.id")
  List<Long> findClosingIds();

  // 閉鎖済みから期間がたった店舗の連絡先（担当者名・連絡用メール）を消す。行は消さない（#79 決定事項10）。
  @Modifying
  @Query(
    "update StoreEntity s set s.contact = '', s.email = '', s.revision = s.revision + 1 " +
      "where s.closedAt is not null and s.closedAt < :before and (s.contact <> '' or s.email <> '')"
  )
  int clearClosedContacts(@Param("before") Instant before);
}
