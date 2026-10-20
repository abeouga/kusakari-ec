package jp.kusakari.ec.commerce.service;

import java.util.List;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.persistence.repository.InventoryRepository;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderView;
import jp.kusakari.ec.commerce.mapper.OrderResponseMapper;
import jp.kusakari.ec.commerce.persistence.entity.*;
import jp.kusakari.ec.commerce.persistence.repository.*;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.notification.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class OrderWorkflowService {

  private final AuthService auth;
  private final OrderRepository orders;
  private final OrderItemRepository items;
  private final OrderDetailsRepository details;
  private final InventoryRepository inventory;
  private final OrderResponseMapper mapper;
  private final NotificationService notices;

  @Transactional(readOnly = true)
  public List<OrderView> sellerOrders(long storeId) {
    auth.requireSeller(storeId);
    return orders.findByStoreIdOrderByCreatedAtDesc(storeId).stream().map(this::view).toList();
  }

  @Transactional(readOnly = true)
  public List<OrderView> allOrders() {
    auth.requireAdmin();
    return orders.findAllByOrderByCreatedAtDesc().stream().map(this::view).toList();
  }

  @Transactional(readOnly = true)
  public OrderView buyerOrder(String id) {
    var order = orders.findById(id).orElseThrow(this::missing);
    requireBuyer(order);
    return view(order);
  }

  @Transactional(readOnly = true)
  public OrderView sellerOrder(String id) {
    var order = orders.findById(id).orElseThrow(this::missing);
    requireStore(order);
    return view(order);
  }

  public OrderView changeStatus(String id, String expectedStatus, String status) {
    var order = orders.lockOrder(id).orElseThrow(this::missing);
    requireStore(order);
    if (!order.getStatus().equals(expectedStatus)) conflict();
    boolean ready = expectedStatus.equals("ACCEPTED") && status.equals("READY");
    boolean complete = expectedStatus.equals("READY") && status.equals("COMPLETED");
    if ((!ready && !complete) || order.getCancellationStatus().equals("PENDING")) conflict();
    if (ready) order.markReady();
    else order.completePickup();
    notices.send(
      order.getBuyerMemberId(),
      ready ? "受取準備が完了しました" : "商品をお渡ししました",
      order.getId() + " / " + order.getStoreName()
    );
    return view(order);
  }

  public OrderView requestCancellation(String id, String reason) {
    var order = orders.lockOrder(id).orElseThrow(this::missing);
    requireBuyer(order);
    if (!order.getStatus().equals("ACCEPTED") || order.getCancellationStatus().equals("PENDING")) conflict();
    order.requestCancellation(reason);
    notices.toStore(order.getStoreId(), "キャンセル申請が届きました", id);
    return view(order);
  }

  public OrderView decideCancellation(String id, boolean approved, String reason) {
    var order = orders.lockOrder(id).orElseThrow(this::missing);
    requireStore(order);
    if (!order.getStatus().equals("ACCEPTED") || !order.getCancellationStatus().equals("PENDING")) conflict();
    if (!approved && reason.isBlank()) throw new ApiException(400, "REASON_REQUIRED", "却下理由を入力してください。");
    if (approved) {
      // Match checkout's ascending product order. The order lock prevents double restocking.
      items
        .findAllForOrder(id)
        .stream()
        .sorted(java.util.Comparator.comparing(i -> i.getId().getProductId()))
        .forEach(item -> {
          var stock = inventory
            .lockAtStore(order.getStoreId(), item.getId().getProductId())
            .orElseThrow(() -> new ApiException(409, "STOCK_NOT_FOUND", "在庫情報が見つかりません。"));
          stock.setQuantity(Math.addExact(stock.getQuantity(), item.getQuantity()));
        });
    }
    order.decideCancellation(approved, reason);
    notices.send(
      order.getBuyerMemberId(),
      approved ? "注文をキャンセルしました" : "キャンセル申請の結果",
      id + " " + reason
    );
    return view(order);
  }

  private OrderView view(OrderEntity order) {
    return mapper.toView(
      order,
      items.findAllForOrder(order.getId()),
      details.findById(order.getId()).map(OrderDetailsEntity::getDetails).orElseGet(DeliveryFields::empty)
    );
  }

  private void requireBuyer(OrderEntity order) {
    if (!auth.current().getId().equals(order.getBuyerMemberId())) throw missing();
  }

  private void requireStore(OrderEntity order) {
    if (order.getStoreId() == null) throw missing();
    var member = auth.current();
    if (!member.getRole().equals("ADMIN") && !order.getStoreId().equals(member.getStoreId())) throw missing();
    auth.requireSeller(order.getStoreId());
  }

  private ApiException missing() {
    return new ApiException(404, "ORDER_NOT_FOUND", "注文が見つかりません。");
  }

  private void conflict() {
    throw new ApiException(409, "ORDER_CHANGED", "注文状態が変わりました。最新の状態を確認してください。");
  }
}
