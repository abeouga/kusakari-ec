package jp.kusakari.ec.commerce.mapper;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import jp.kusakari.ec.catalog.dto.ProductImageReference;
import jp.kusakari.ec.catalog.persistence.repository.ProductRepository;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderLine;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderView;
import jp.kusakari.ec.commerce.persistence.entity.DeliveryFields;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderItemEntity;
import jp.kusakari.ec.commerce.service.DeliveryService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OrderResponseMapper {

  private final DeliveryService delivery;
  private final ProductRepository products;

  public OrderView toView(OrderEntity order, List<OrderItemEntity> items, DeliveryFields details) {
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
      order.getSubtotalYen(),
      order.getShippingFeeYen(),
      delivery.view(details)
    );
  }
}
