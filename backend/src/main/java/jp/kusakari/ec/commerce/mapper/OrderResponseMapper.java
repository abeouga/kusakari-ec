package jp.kusakari.ec.commerce.mapper;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import jp.kusakari.ec.catalog.dto.ProductImageReference;
import jp.kusakari.ec.catalog.persistence.repository.ProductRepository;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderLine;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderView;
import jp.kusakari.ec.commerce.dto.SalesDtos.SalesFigures;
import jp.kusakari.ec.commerce.dto.DeliveryDtos.DetailsView;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderItemEntity;
import jp.kusakari.ec.payment.persistence.entity.PaymentEntity;
import jp.kusakari.ec.payment.persistence.entity.RefundEntity;
import jp.kusakari.ec.payment.persistence.repository.PaymentRepository;
import jp.kusakari.ec.payment.persistence.repository.RefundRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OrderResponseMapper {

  private final ProductRepository products;
  private final PaymentRepository payments;
  private final RefundRepository refunds;

  /** 購入者向け。販売手数料は返さない。 */
  public OrderView toView(OrderEntity order, List<OrderItemEntity> items) {
    return toView(order, items, false);
  }

  /** 店舗・運営向け。注文ごとの販売手数料を含める（#130）。 */
  public OrderView toStoreView(OrderEntity order, List<OrderItemEntity> items) {
    return toView(order, items, true);
  }

  /**
   * 注文1件の手数料と差引額。キャンセルの注文は手数料なし（保存した額は残し、表示で 0 にする）。
   * 支払い待ちは、支払われるまで合計に含めない。
   */
  public SalesFigures figures(OrderEntity order) {
    boolean cancelled = "CANCELLED".equals(order.getStatus());
    int commission = cancelled ? 0 : order.getCommissionYen();
    int net = cancelled ? 0 : order.getTotalYen() - commission;
    boolean counted = !cancelled && !"PENDING_PAYMENT".equals(order.getStatus());
    return new SalesFigures(order.getCommissionRateBp(), commission, net, counted);
  }

  private OrderView toView(OrderEntity order, List<OrderItemEntity> items, boolean store) {
    Map<String, String> images = products
      .findImageReferences(
        items
          .stream()
          .map(item -> item.getId().getProductId())
          .toList()
      )
      .stream()
      .collect(Collectors.toMap(ProductImageReference::id, ProductImageReference::imageUrl));
    List<OrderLine> lines = items
      .stream()
      .map(item ->
        new OrderLine(
          item.getId().getProductId(),
          item.getSku(),
          item.getProductName(),
          item.getQuantity(),
          item.getUnitPriceYen(),
          Math.multiplyExact(item.getQuantity(), item.getUnitPriceYen()),
          images.get(item.getId().getProductId())
        )
      )
      .toList();

    return new OrderView(
      order.getId(),
      order.getStatus(),
      order.getStoreId(),
      order.getBuyerMemberId(),
      order.getPickupAddress(),
      order.getPickupHours(),
      order.getReadyAt(),
      order.getPickedUpAt(),
      order.getCancellationStatus(),
      order.getCancellationReason(),
      order.getCancellationResponse(),
      DateTimeFormatter.ISO_INSTANT.format(order.getCreatedAt()),
      order.getStoreName(),
      order.getTotalYen(),
      lines,
      new DetailsView(
        order.getPaymentMethod(),
        order.getRecipientName(),
        order.getRecipientPhone(),
        order.getContactEmail()
      ),
      order.getPaymentId() == null
        ? null
        : payments.findById(order.getPaymentId()).map(PaymentEntity::getStatus).orElse(null),
      refunds.findByOrderId(order.getId()).map(RefundEntity::getStatus).orElse(null),
      store ? figures(order) : null
    );
  }
}
