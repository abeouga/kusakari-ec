package jp.kusakari.ec.store.persistence.repository;

import java.util.*;
import jp.kusakari.ec.store.persistence.entity.StoreApplicationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreApplicationRepository extends JpaRepository<StoreApplicationEntity, String> {
  List<StoreApplicationEntity> findByMemberIdOrderByCreatedAtDesc(String memberId);
  boolean existsByMemberIdAndStatus(String memberId, String status);

  @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
  @org.springframework.data.jpa.repository.Query("select a from StoreApplicationEntity a where a.id=:id")
  Optional<StoreApplicationEntity> lock(@org.springframework.data.repository.query.Param("id") String id);
}
