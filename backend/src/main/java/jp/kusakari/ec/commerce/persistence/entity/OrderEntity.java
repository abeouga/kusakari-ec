package jp.kusakari.ec.commerce.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "orders")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderEntity {

  @Column(name = "buyer_member_id", nullable = false, columnDefinition = "CHAR(36)")
  private String buyerMemberId;

  @Column(name = "store_id", nullable = false)
  private Long storeId;

  /** 注文したときの店舗の住所と営業時間。後で店舗の情報を変えても、注文の記録は変わらない。 */
  @Column(name = "store_address", length = 255, nullable = false)
  private String pickupAddress = "";

  @Column(name = "store_business_hours", length = 255, nullable = false)
  private String pickupHours = "";

  private Instant readyAt;
  private Instant pickedUpAt;

  @Column(length = 24, nullable = false)
  private String cancellationStatus = "NONE";

  @Column(length = 1000, nullable = false)
  private String cancellationReason = "";

  @Column(length = 1000, nullable = false)
  private String cancellationResponse = "";

  private Instant cancellationAt;

  /** キャンセルを承認した会員（店舗の担当者・オーナー・運営）。 */
  @Column(name = "cancelled_by_member_id", columnDefinition = "CHAR(36)")
  private String cancelledByMemberId;

  @Id
  @Column(length = 36, columnDefinition = "CHAR(36)")
  private String id;

  @Column(name = "cart_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
  private String cartId;

  @Column(name = "request_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
  private String requestId;

  @Column(name = "request_revision", nullable = false)
  private long requestRevision;

  @Column(name = "store_name", nullable = false, length = 120)
  private String storeName;

  @Column(name = "total_yen", nullable = false)
  private int totalYen;

  /** 注文したときの手数料の率（1万分率）と額。後で率を変えても、過去の注文は変わらない。 */
  @Column(name = "commission_rate_bp", nullable = false)
  private int commissionRateBp;

  @Column(name = "commission_yen", nullable = false)
  private int commissionYen;

  @Column(name = "payment_method", nullable = false, length = 32)
  private String paymentMethod;

  @Column(name = "recipient_name", nullable = false, length = 120)
  private String recipientName = "";

  @Column(name = "recipient_phone", nullable = false, length = 40)
  private String recipientPhone = "";

  @Column(name = "contact_email", nullable = false, length = 255)
  private String contactEmail = "";

  @Column(nullable = false, length = 30)
  private String status = "ACCEPTED";

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt = Instant.now();

  @Column(name = "deleted_at")
  private Instant deletedAt;

  public OrderEntity(
    String id,
    String cartId,
    String requestId,
    long requestRevision,
    String storeName,
    int totalYen,
    int commissionRateBp,
    int commissionYen,
    String paymentMethod
  ) {
    this.id = id;
    this.cartId = cartId;
    this.requestId = requestId;
    this.requestRevision = requestRevision;
    this.storeName = storeName;
    this.totalYen = totalYen;
    this.commissionRateBp = commissionRateBp;
    this.commissionYen = commissionYen;
    this.paymentMethod = paymentMethod;
  }

  public void assignPickup(String buyerId, Long storeId, String address, String hours) {
    this.buyerMemberId = buyerId;
    this.storeId = storeId;
    this.pickupAddress = address;
    this.pickupHours = hours;
  }

  public void changeRecipient(String recipientName, String recipientPhone, String contactEmail) {
    this.recipientName = recipientName;
    this.recipientPhone = recipientPhone;
    this.contactEmail = contactEmail;
  }

  public void markReady() {
    status = "READY";
    readyAt = Instant.now();
  }

  public void completePickup() {
    status = "COMPLETED";
    pickedUpAt = Instant.now();
  }

  public void requestCancellation(String reason) {
    cancellationStatus = "PENDING";
    cancellationReason = reason.trim();
    cancellationResponse = "";
    cancellationAt = Instant.now();
  }

  public void decideCancellation(boolean approved, String reason, String decidedByMemberId) {
    if (approved) {
      status = "CANCELLED";
      cancelledByMemberId = decidedByMemberId;
    }
    cancellationStatus = approved ? "APPROVED" : "REJECTED";
    cancellationResponse = reason.trim();
    cancellationAt = Instant.now();
  }

  public void archive() {
    deletedAt = Instant.now();
  }
}
