package jp.kusakari.ec.payment.persistence.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.payment.persistence.entity.PaymentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository extends JpaRepository<PaymentEntity, String> {
  Optional<PaymentEntity> findByCartIdAndRequestId(String cartId, String requestId);

  // 決済 → 注文 → 在庫（商品 ID の昇順）の順にロックする。
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from PaymentEntity p where p.id = :id")
  Optional<PaymentEntity> lock(@Param("id") String id);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from PaymentEntity p where p.paymentIntentId = :intentId")
  Optional<PaymentEntity> lockByIntent(@Param("intentId") String intentId);

  @Query("select p.id from PaymentEntity p where p.status = 'PENDING' and p.createdAt < :before order by p.createdAt")
  List<String> findPendingBefore(@Param("before") Instant before);
}
