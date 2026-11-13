package jp.kusakari.ec.commerce.dto;

import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;

public final class CommerceDtos {

  private CommerceDtos() {}

  public record ItemRequest(@Min(0) @Max(99) int quantity, @PositiveOrZero long revision) {}

  public record CheckoutRequest(
    @NotNull UUID requestId,
    @PositiveOrZero long revision,
    @Positive int expectedTotalYen,
    @NotNull @Pattern(regexp = "CARD|PAY_AT_STORE") String paymentMethod
  ) {}

  /**
   * One checkout creates one order per store (issue #70), ordered by store ID.
   * payment はカードのときだけ（店頭払いは null）。お会計1回の決済で、全店舗の注文の合計を支払う。
   */
  public record CheckoutResult(List<OrderView> orders, CardPayment payment) {}

  /** clientSecret は支払い待ち（PENDING）のときだけ。画面は Stripe の Payment Element にこれを渡して支払う。 */
  public record CardPayment(String id, String status, int amountYen, String clientSecret) {}

  /**
   * storeId/storeName は商品の店舗。その店舗が販売し、在庫を持ち、受け渡す。
   * unavailableReason は今は買えない理由（非公開・商品の停止など。買えるなら null）。在庫不足だけなら null で available が false。
   */
  public record CartLine(
    ProductView product,
    int quantity,
    int lineTotalYen,
    boolean available,
    long storeId,
    String storeName,
    String unavailableReason
  ) {}

  /**
   * 送料はないので、subtotalYen と totalYen は同じ値。受取店舗は明細ごとの {@link CartLine#storeId()}。
   * removedItems は、カートを開いたときに買えなくなったため外した明細（#119）。外さなかったときは空。
   */
  public record CartView(
    long revision,
    List<CartLine> items,
    int totalYen,
    int itemCount,
    boolean canCheckout,
    int subtotalYen,
    DeliveryDtos.DetailsView details,
    List<RemovedLine> removedItems
  ) {}

  /** 外した明細。reason は DELETED / STORE_CLOSED / STORE_SUSPENDED / ORGANIZATION_SUSPENDED のどれか。 */
  public record RemovedLine(String productId, String name, String storeName, int quantity, String reason) {}

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
    DeliveryDtos.DetailsView details,
    // カードの注文の決済の状態（PENDING / SUCCEEDED / FAILED / EXPIRED）。店頭払いは null。
    String paymentStatus,
    // 返金の状態（REQUESTED / SUCCEEDED / FAILED）。返金がなければ null。
    String refundStatus
  ) {}
}
