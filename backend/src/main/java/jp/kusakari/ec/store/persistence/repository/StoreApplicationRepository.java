package jp.kusakari.ec.store.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.store.persistence.entity.StoreApplicationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StoreApplicationRepository extends JpaRepository<StoreApplicationEntity, String> {
  List<StoreApplicationEntity> findByMemberIdOrderByCreatedAtDesc(String memberId);

  List<StoreApplicationEntity> findAllByOrderByCreatedAtDesc();

  // 今の申請（latest = true）が先頭に来る。
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select a from StoreApplicationEntity a where a.memberId = :memberId order by a.latest desc")
  List<StoreApplicationEntity> lockAllForMember(@Param("memberId") String memberId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select a from StoreApplicationEntity a where a.id=:id")
  Optional<StoreApplicationEntity> lock(@Param("id") String id);
}
