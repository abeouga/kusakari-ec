package jp.kusakari.ec.commerce.persistence.repository;

import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.commerce.persistence.entity.CartItemEntity;
import jp.kusakari.ec.commerce.persistence.entity.CartItemId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CartItemRepository extends JpaRepository<CartItemEntity, CartItemId> {
  @Query("select i from CartItemEntity i where i.id.cartId = :cartId order by i.id.productId")
  List<CartItemEntity> findAllForCart(@Param("cartId") String cartId);

  @Query("select i from CartItemEntity i where i.id.cartId = :cartId and i.id.productId = :productId")
  Optional<CartItemEntity> findForCart(@Param("cartId") String cartId, @Param("productId") String productId);
}
