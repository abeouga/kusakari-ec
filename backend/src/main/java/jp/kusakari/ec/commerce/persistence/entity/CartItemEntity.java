package jp.kusakari.ec.commerce.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** カートの明細。受取店舗は商品の店舗なので、明細には持たない。 */
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

  public CartItemEntity(CartItemId id, int quantity) {
    this.id = id;
    this.quantity = quantity;
  }
}
