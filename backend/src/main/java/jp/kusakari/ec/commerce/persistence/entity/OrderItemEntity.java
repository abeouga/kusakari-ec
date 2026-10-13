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
@Table(name = "order_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderItemEntity {

  @EmbeddedId
  private OrderItemId id;

  @Column(nullable = false, length = 50)
  private String sku;

  @Column(name = "product_name", nullable = false, length = 120)
  private String productName;

  @Column(nullable = false)
  private int quantity;

  @Column(name = "unit_price_yen", nullable = false)
  private int unitPriceYen;

  public OrderItemEntity(OrderItemId id, String sku, String productName, int quantity, int unitPriceYen) {
    this.id = id;
    this.sku = sku;
    this.productName = productName;
    this.quantity = quantity;
    this.unitPriceYen = unitPriceYen;
  }
}
