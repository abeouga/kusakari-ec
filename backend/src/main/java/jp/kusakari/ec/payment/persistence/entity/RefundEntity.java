package jp.kusakari.ec.payment.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 注文1件の返金（Stripe の Refund）。注文1件に1行。結果（成功・失敗）は Webhook で反映する。 */
@Entity
@Table(name = "refunds")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefundEntity {

  public static final String REQUESTED = "REQUESTED";
  public static final String SUCCEEDED = "SUCCEEDED";
  public static final String FAILED = "FAILED";

  @Id
  @Column(length = 36, columnDefinition = "CHAR(36)")
  private String id;

  @Column(name = "order_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
  private String orderId;

  @Column(name = "payment_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
  private String paymentId;

  @Column(name = "stripe_refund_id", length = 255)
  private String stripeRefundId;

  @Column(nullable = false, length = 16)
  private String status = REQUESTED;

  @Column(name = "amount_yen", nullable = false)
  private int amountYen;

  /** 返金を始めた人。Stripe の管理画面からの返金は null。 */
  @Column(name = "requested_by_member_id", length = 36, columnDefinition = "CHAR(36)")
  private String requestedByMemberId;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt = Instant.now();

  public RefundEntity(String id, String orderId, String paymentId, int amountYen, String requestedByMemberId) {
    this.id = id;
    this.orderId = orderId;
    this.paymentId = paymentId;
    this.amountYen = amountYen;
    this.requestedByMemberId = requestedByMemberId;
  }

  public void attachStripeRefund(String stripeRefundId) {
    if (this.stripeRefundId == null) this.stripeRefundId = stripeRefundId;
  }

  public void changeStatus(String status) {
    if (!REQUESTED.equals(status) && !SUCCEEDED.equals(status) && !FAILED.equals(status)) {
      throw new IllegalArgumentException("Unexpected status.");
    }
    this.status = status;
  }
}
