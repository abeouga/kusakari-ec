package jp.kusakari.ec.payment.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import jp.kusakari.ec.payment.persistence.entity.RefundEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefundRepository extends JpaRepository<RefundEntity, String> {
  Optional<RefundEntity> findByOrderId(String orderId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select r from RefundEntity r where r.id = :id")
  Optional<RefundEntity> lock(@Param("id") String id);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select r from RefundEntity r where r.stripeRefundId = :stripeRefundId")
  Optional<RefundEntity> lockByStripeRefund(@Param("stripeRefundId") String stripeRefundId);
}
