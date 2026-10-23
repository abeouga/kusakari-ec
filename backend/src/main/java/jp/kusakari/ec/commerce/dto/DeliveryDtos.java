package jp.kusakari.ec.commerce.dto;

import jakarta.validation.constraints.*;

public final class DeliveryDtos {

  private DeliveryDtos() {}

  public record DetailsRequest(
    @NotNull @Size(max = 100) String recipientName,
    @NotNull @Pattern(regexp = "[0-9+() -]{0,30}") String recipientPhone,
    @NotNull @Email @Size(max = 200) String contactEmail
  ) {}

  public record DetailsView(
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
  ) {}
}
