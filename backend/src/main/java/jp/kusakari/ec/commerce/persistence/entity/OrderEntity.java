package jp.kusakari.ec.commerce.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderEntity {

  @Id
  @Column(length = 36, columnDefinition = "CHAR(36)")
  private String id;

  @Column(name = "cart_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
  private String cartId;

  @Column(name = "request_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
  private String requestId;

  @Column(name = "request_revision", nullable = false)
  private long requestRevision;

  @Column(name = "store_name", nullable = false, length = 100)
  private String storeName;

  @Column(name = "total_yen", nullable = false)
  private int totalYen;

  @Column(nullable = false, length = 30)
  private String status = "DEMO_CONFIRMED";

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt = Instant.now();

  @Column(name = "subtotal_yen", nullable = false)
  private int subtotalYen;

  @Column(name = "shipping_fee_yen", nullable = false)
  private int shippingFeeYen;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  public OrderEntity(
    String id,
    String cartId,
    String requestId,
    long requestRevision,
    String storeName,
    int totalYen,
    int subtotalYen,
    int shippingFeeYen
  ) {
    this.id = id;
    this.cartId = cartId;
    this.requestId = requestId;
    this.requestRevision = requestRevision;
    this.storeName = storeName;
    this.totalYen = totalYen;
    this.subtotalYen = subtotalYen;
    this.shippingFeeYen = shippingFeeYen;
  }

  public void archive() {
    deletedAt = Instant.now();
  }
}
