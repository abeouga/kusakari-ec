package jp.kusakari.ec.commerce.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public final class DeliveryDtos {

  private DeliveryDtos() {}

  public record DetailsRequest(
    @NotNull @Pattern(regexp = "PICKUP|DELIVERY") String fulfillmentMethod,
    @NotNull @Pattern(regexp = "DEMO_CARD|STORE|DEMO_WALLET") String paymentMethod,
    @NotNull @Size(max = 100) String recipientName,
    @NotNull @Pattern(regexp = "[0-9+() -]{0,30}") String recipientPhone,
    @NotNull @Email @Size(max = 200) String contactEmail,
    @NotNull @Pattern(regexp = "|[0-9]{3}-?[0-9]{4}") String postalCode,
    @NotNull @Size(max = 200) String addressLine1,
    @NotNull @Size(max = 200) String addressLine2,
    @NotNull @Pattern(regexp = "|[0-9]{4}-[0-9]{2}-[0-9]{2}") String requestedDate,
    @NotNull @Pattern(regexp = "ANY|10-12|14-16|16-18") String timeSlot
  ) {}

  public record CartDetailsRequest(@PositiveOrZero long revision, @NotNull @Valid DetailsRequest details) {}

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
