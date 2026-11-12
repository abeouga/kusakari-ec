package jp.kusakari.ec.commerce.service;

import java.util.List;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderView;
import jp.kusakari.ec.commerce.dto.DeliveryDtos.DetailsRequest;
import jp.kusakari.ec.commerce.mapper.OrderResponseMapper;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
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
  private final OrderResponseMapper mapper;

  public List<OrderView> list(String cartId) {
    return orders
      .findByBuyerMemberIdAndDeletedAtIsNullOrderByCreatedAtDesc(auth.current().getId())
      .stream()
      .map(this::view)
      .toList();
  }

  /** 受取連絡先だけを変える。支払方法は注文したときのまま。 */
  public OrderView updateDetails(String cartId, String orderId, DetailsRequest request) {
    OrderEntity order = ownedOrder(orderId);
    if (!order.getStatus().equals("ACCEPTED")) throw new ApiException(
      409,
      "ORDER_FIXED",
      "受付中の注文のみ編集できます。"
    );
    order.changeRecipient(request.recipientName().trim(), request.recipientPhone(), request.contactEmail());
    return view(order);
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
    return mapper.toView(order, items.findAllForOrder(order.getId()));
  }
}
