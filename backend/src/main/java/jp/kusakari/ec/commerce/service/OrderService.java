package jp.kusakari.ec.commerce.service;

import java.util.List;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderView;
import jp.kusakari.ec.commerce.dto.DeliveryDtos.DetailsRequest;
import jp.kusakari.ec.commerce.mapper.OrderResponseMapper;
import jp.kusakari.ec.commerce.persistence.entity.DeliveryFields;
import jp.kusakari.ec.commerce.persistence.entity.OrderDetailsEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderItemEntity;
import jp.kusakari.ec.commerce.persistence.repository.OrderDetailsRepository;
import jp.kusakari.ec.commerce.persistence.repository.OrderItemRepository;
import jp.kusakari.ec.commerce.persistence.repository.OrderRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class OrderService {

  private final jp.kusakari.ec.auth.AuthService auth;
  private final OrderRepository orders;
  private final OrderItemRepository items;
  private final OrderDetailsRepository details;
  private final DeliveryService delivery;
  private final OrderResponseMapper mapper;

  public List<OrderView> list(String cartId) {
    return orders
      .findByBuyerMemberIdAndDeletedAtIsNullOrderByCreatedAtDesc(auth.current().getId())
      .stream()
      .map(this::view)
      .toList();
  }

  public OrderView updateDetails(String cartId, String orderId, DetailsRequest request) {
    OrderEntity order = ownedOrder(orderId);
    if (!order.getStatus().equals("ACCEPTED")) throw new ApiException(
      409,
      "ORDER_FIXED",
      "受付中の注文のみ編集できます。"
    );
    DeliveryFields previous = details
      .findById(orderId)
      .map(OrderDetailsEntity::getDetails)
      .orElseGet(DeliveryFields::empty);
    if (!previous.getFulfillmentMethod().equals("PICKUP")) {
      throw new ApiException(409, "ORDER_METHOD_FIXED", "注文後は受取・配送区分を変更できません。");
    }
    DeliveryFields updated = delivery.validate(request);
    updated.setPaymentMethod(previous.getPaymentMethod());
    details.save(new OrderDetailsEntity(orderId, updated));
    return mapper.toView(order, items.findAllForOrder(orderId), updated);
  }

  public void delete(String cartId, String orderId) {
    OrderEntity order = ownedOrder(orderId);
    order.archive();
  }

  private OrderEntity ownedOrder(String id) {
    String buyer = auth.current().getId();
    return orders
      .lockOrder(id)
      .filter(o -> buyer.equals(o.getBuyerMemberId()) && o.getDeletedAt() == null)
      .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "注文が見つかりません。"));
  }

  private OrderView view(OrderEntity order) {
    List<OrderItemEntity> lines = items.findAllForOrder(order.getId());
    DeliveryFields savedDetails = details
      .findById(order.getId())
      .map(OrderDetailsEntity::getDetails)
      .orElseGet(DeliveryFields::empty);
    return mapper.toView(order, lines, savedDetails);
  }
}
