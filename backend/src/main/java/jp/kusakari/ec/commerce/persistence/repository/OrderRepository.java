package jp.kusakari.ec.commerce.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.Collection;
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

  // 同じ決済（お会計）の注文。決済の行をロックしてから、注文 ID の順にロックする。
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select o from OrderEntity o where o.paymentId = :paymentId order by o.id")
  List<OrderEntity> lockByPayment(@Param("paymentId") String paymentId);

  List<OrderEntity> findByCartIdAndRequestIdOrderByStoreIdAsc(String cartId, String requestId);

  List<OrderEntity> findTop30ByCartIdAndDeletedAtIsNullOrderByCreatedAtDescIdAsc(String cartId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select o from OrderEntity o where o.cartId = :cartId and o.id = :orderId and o.deletedAt is null")
  Optional<OrderEntity> findLocked(@Param("cartId") String cartId, @Param("orderId") String orderId);

  // 店舗の閉鎖・組織の停止を止める注文（支払い待ち・注文受付・受取準備完了）の件数。判定は閉鎖と停止で共通（#79 決定事項6）。
  @Query("select count(o) from OrderEntity o where o.storeId in :storeIds and o.status in :statuses")
  long countByStatus(@Param("storeIds") Collection<Long> storeIds, @Param("statuses") Collection<String> statuses);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select o from OrderEntity o where o.storeId in :storeIds and o.status in :statuses order by o.id")
  List<OrderEntity> lockByStatus(@Param("storeIds") Collection<Long> storeIds, @Param("statuses") Collection<String> statuses);

  @Query(
    "select distinct o.buyerMemberId from OrderEntity o where o.storeId in :storeIds and o.status in :statuses"
  )
  List<String> findBuyersByStatus(
    @Param("storeIds") Collection<Long> storeIds,
    @Param("statuses") Collection<String> statuses
  );
}
