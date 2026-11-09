package jp.kusakari.ec.commerce.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "cart_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CartItemEntity {

  @EmbeddedId
  private CartItemId id;

  @Column(nullable = false)
  private int quantity;

  /** Pickup store of this line (issue #70). NULL only for rows written before V15; see {@link #pickupStoreId}. */
  @Column(name = "store_id")
  private Long storeId;

  public CartItemEntity(CartItemId id, int quantity, long storeId) {
    this.id = id;
    this.quantity = quantity;
    this.storeId = storeId;
  }

  public long pickupStoreId(CartEntity cart) {
    return storeId == null ? cart.getStoreId() : storeId;
  }
}
