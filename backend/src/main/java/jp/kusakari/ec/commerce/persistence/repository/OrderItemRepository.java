package jp.kusakari.ec.commerce.persistence.repository;

import java.util.List;
import jp.kusakari.ec.commerce.persistence.entity.OrderItemEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderItemId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderItemRepository extends JpaRepository<OrderItemEntity, OrderItemId> {
  @Query("select i from OrderItemEntity i where i.id.orderId = :orderId order by i.id.productId")
  List<OrderItemEntity> findAllForOrder(@Param("orderId") String orderId);
}
