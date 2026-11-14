package jp.kusakari.ec.payment.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** お会計1回のカード決済（Stripe の PaymentIntent 1つ）。店頭払いのお会計には作らない。 */
@Entity
@Table(name = "payments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentEntity {

  public static final String PENDING = "PENDING";
  public static final String SUCCEEDED = "SUCCEEDED";
  public static final String FAILED = "FAILED";
  public static final String EXPIRED = "EXPIRED";

  @Id
  @Column(length = 36, columnDefinition = "CHAR(36)")
  private String id;

  @Column(name = "cart_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
  private String cartId;

  @Column(name = "request_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
  private String requestId;

  @Column(name = "buyer_member_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
  private String buyerMemberId;

  @Column(name = "payment_intent_id", length = 255)
  private String paymentIntentId;

  @Column(nullable = false, length = 16)
  private String status = PENDING;

  @Column(name = "amount_yen", nullable = false)
  private int amountYen;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt = Instant.now();

  public PaymentEntity(String id, String cartId, String requestId, String buyerMemberId, int amountYen) {
    this.id = id;
    this.cartId = cartId;
    this.requestId = requestId;
    this.buyerMemberId = buyerMemberId;
    this.amountYen = amountYen;
  }

  public boolean isPending() {
    return PENDING.equals(status);
  }

  public void attachIntent(String paymentIntentId) {
    if (this.paymentIntentId == null) this.paymentIntentId = paymentIntentId;
  }

  public void succeed() {
    status = SUCCEEDED;
  }

  /** 支払いが失敗した（FAILED）か、時間切れになった（EXPIRED）。 */
  public void close(String status) {
    if (!FAILED.equals(status) && !EXPIRED.equals(status)) throw new IllegalArgumentException("Unexpected status.");
    this.status = status;
  }
}
