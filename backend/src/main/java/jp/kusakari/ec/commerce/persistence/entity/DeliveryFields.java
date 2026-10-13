package jp.kusakari.ec.commerce.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Embeddable
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DeliveryFields {

  public static DeliveryFields empty() {
    return new DeliveryFields("PICKUP", "DEMO_CARD", "", "", "", "", "", "", "", "ANY");
  }

  @Column(name = "fulfillment_method", nullable = false, length = 20)
  private String fulfillmentMethod = "PICKUP";

  @Column(name = "payment_method", nullable = false, length = 20)
  private String paymentMethod = "DEMO_CARD";

  @Column(name = "recipient_name", nullable = false, length = 100)
  private String recipientName = "";

  @Column(name = "recipient_phone", nullable = false, length = 30)
  private String recipientPhone = "";

  @Column(name = "contact_email", nullable = false, length = 200)
  private String contactEmail = "";

  @Column(name = "postal_code", nullable = false, length = 8)
  private String postalCode = "";

  @Column(name = "address_line1", nullable = false, length = 200)
  private String addressLine1 = "";

  @Column(name = "address_line2", nullable = false, length = 200)
  private String addressLine2 = "";

  @Column(name = "requested_date", nullable = false, length = 10)
  private String requestedDate = "";

  @Column(name = "time_slot", nullable = false, length = 20)
  private String timeSlot = "ANY";

  public DeliveryFields(
    String fulfillmentMethod,
    String paymentMethod,
    String recipientName,
    String recipientPhone,
    String contactEmail,
    String postalCode,
    String addressLine1,
    String addressLine2,
    String requestedDate,
    String timeSlot
  ) {
    this.fulfillmentMethod = fulfillmentMethod;
    this.paymentMethod = paymentMethod;
    this.recipientName = recipientName;
    this.recipientPhone = recipientPhone;
    this.contactEmail = contactEmail;
    this.postalCode = postalCode;
    this.addressLine1 = addressLine1;
    this.addressLine2 = addressLine2;
    this.requestedDate = requestedDate;
    this.timeSlot = timeSlot;
  }
}
