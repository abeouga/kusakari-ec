package jp.kusakari.ec.commerce.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<OrderEntity, String> {
  List<OrderEntity> findByBuyerMemberIdAndDeletedAtIsNullOrderByCreatedAtDesc(String memberId);
  List<OrderEntity> findByStoreIdOrderByCreatedAtDesc(Long storeId);
  List<OrderEntity> findAllByOrderByCreatedAtDesc();

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select o from OrderEntity o where o.id=:id")
  Optional<OrderEntity> lockOrder(@Param("id") String id);

  Optional<OrderEntity> findByCartIdAndRequestId(String cartId, String requestId);

  List<OrderEntity> findTop30ByCartIdAndDeletedAtIsNullOrderByCreatedAtDescIdAsc(String cartId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select o from OrderEntity o where o.cartId = :cartId and o.id = :orderId and o.deletedAt is null")
  Optional<OrderEntity> findLocked(@Param("cartId") String cartId, @Param("orderId") String orderId);
}
