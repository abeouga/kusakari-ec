package jp.kusakari.ec.commerce.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;

public final class CommerceDtos {

  private CommerceDtos() {}

  public record ItemRequest(@Min(0) @Max(99) int quantity, @PositiveOrZero long revision) {}

  public record StoreRequest(@Positive long storeId, @PositiveOrZero long revision) {}

  public record GuestItem(@NotBlank @Size(max = 100) String productId, @Min(1) @Max(99) int quantity) {}

  public record GuestCartRequest(
    @PositiveOrZero long revision,
    @Positive long storeId,
    @NotEmpty @Size(max = 50) List<@NotNull @Valid GuestItem> items
  ) {}

  public record CheckoutRequest(
    @NotNull UUID requestId,
    @PositiveOrZero long revision,
    @Positive int expectedTotalYen,
    @NotNull @Pattern(regexp = "CREDIT_CARD|PAYPAY|RAKUTEN_PAY|PAY_AT_STORE") String paymentMethod
  ) {}

  /** One checkout creates one order per pickup store (issue #70), ordered by store ID. */
  public record CheckoutResult(List<OrderView> orders) {}

  /** Issue #70: storeId/storeName are this line's pickup store, which sells and stocks the product. */
  public record CartLine(
    ProductView product,
    int quantity,
    int lineTotalYen,
    boolean available,
    long storeId,
    String storeName
  ) {}

  /**
   * storeId/storeName are the browsing store that sells Kusakari's shared products. Kept for API compatibility;
   * the pickup store of each line is {@link CartLine#storeId()}.
   */
  public record CartView(
    long revision,
    long storeId,
    String storeName,
    List<CartLine> items,
    int totalYen,
    int itemCount,
    boolean canCheckout,
    int subtotalYen,
    int shippingFeeYen,
    DeliveryDtos.DetailsView details
  ) {}

  public record OrderLine(
    String productId,
    String sku,
    String name,
    int quantity,
    int unitPriceYen,
    int lineTotalYen,
    // Current catalog image; null when the product was removed after ordering.
    String imageUrl
  ) {}

  public record OrderView(
    String id,
    String status,
    Long storeId,
    String buyerMemberId,
    String pickupAddress,
    String pickupHours,
    java.time.Instant readyAt,
    java.time.Instant pickedUpAt,
    String cancellationStatus,
    String cancellationReason,
    String cancellationResponse,
    String createdAt,
    String storeName,
    int totalYen,
    List<OrderLine> items,
    int subtotalYen,
    int shippingFeeYen,
    DeliveryDtos.DetailsView details
  ) {}
}
