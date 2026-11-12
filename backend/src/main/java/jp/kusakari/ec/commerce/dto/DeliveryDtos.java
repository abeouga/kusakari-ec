package jp.kusakari.ec.commerce.dto;

import jakarta.validation.constraints.*;

public final class DeliveryDtos {

  private DeliveryDtos() {}

  public record DetailsRequest(
    @NotNull @Size(max = 100) String recipientName,
    @NotNull @Pattern(regexp = "[0-9+() -]{0,30}") String recipientPhone,
    @NotNull @Email @Size(max = 200) String contactEmail
  ) {}

  /** 店舗受け取りだけなので、支払方法と受取連絡先だけを持つ。カートの支払方法は、お会計まで NONE。 */
  public record DetailsView(String paymentMethod, String recipientName, String recipientPhone, String contactEmail) {}
}
