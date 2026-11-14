package jp.kusakari.ec.store.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.store.persistence.entity.StoreInvitationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StoreInvitationRepository extends JpaRepository<StoreInvitationEntity, String> {
  List<StoreInvitationEntity> findByStoreIdOrderByCreatedAtDesc(long storeId);

  /** 上限回数を超えないよう、キーの行をロックして読む（SELECT ... FOR UPDATE）。 */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select i from StoreInvitationEntity i where i.keyHash = :keyHash")
  Optional<StoreInvitationEntity> lockByKeyHash(@Param("keyHash") String keyHash);
}
