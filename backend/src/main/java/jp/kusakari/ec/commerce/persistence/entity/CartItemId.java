package jp.kusakari.ec.commerce.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Embeddable
@Data
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class CartItemId {

  @Column(name = "cart_id", length = 36, columnDefinition = "CHAR(36)")
  private String cartId;

  @Column(name = "product_id", length = 40)
  private String productId;
}
