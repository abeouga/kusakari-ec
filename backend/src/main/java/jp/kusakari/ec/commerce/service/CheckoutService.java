package jp.kusakari.ec.commerce.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import jp.kusakari.ec.catalog.persistence.repository.InventoryRepository;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CartLine;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CartView;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CheckoutRequest;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderView;
import jp.kusakari.ec.commerce.mapper.OrderResponseMapper;
import jp.kusakari.ec.commerce.persistence.entity.CartEntity;
import jp.kusakari.ec.commerce.persistence.entity.CartItemEntity;
import jp.kusakari.ec.commerce.persistence.entity.DeliveryFields;
import jp.kusakari.ec.commerce.persistence.entity.OrderDetailsEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderItemEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderItemId;
import jp.kusakari.ec.commerce.persistence.repository.CartItemRepository;
import jp.kusakari.ec.commerce.persistence.repository.CartRepository;
import jp.kusakari.ec.commerce.persistence.repository.OrderDetailsRepository;
import jp.kusakari.ec.commerce.persistence.repository.OrderItemRepository;
import jp.kusakari.ec.commerce.persistence.repository.OrderRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.member.persistence.repository.PickupContactRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(isolation = Isolation.READ_COMMITTED)
public class CheckoutService {

  private final jp.kusakari.ec.auth.AuthService auth;
  private final jp.kusakari.ec.catalog.persistence.repository.StoreRepository stores;
  private final jp.kusakari.ec.notification.service.NotificationService notices;
  private final jp.kusakari.ec.catalog.persistence.repository.ProductRepository products;
  private final CartRepository carts;
  private final CartItemRepository cartItems;
  private final PickupContactRepository pickupContacts;
  private final OrderRepository orders;
  private final OrderItemRepository orderItems;
  private final OrderDetailsRepository orderDetails;
  private final InventoryRepository inventory;
  private final CartService cartService;
  private final DeliveryService delivery;
  private final OrderResponseMapper orderMapper;

  public OrderView placeOrder(String cartId, CheckoutRequest request) {
    CartEntity cart = carts
      .findLocked(cartId)
      .orElseThrow(() -> new ApiException(404, "CART_NOT_FOUND", "カートが見つかりません。"));
    String requestId = request.requestId().toString();

    var priorOrder = orders.findByCartIdAndRequestId(cartId, requestId);
    if (priorOrder.isPresent()) {
      OrderEntity order = priorOrder.get();
      OrderView prior = orderView(order);
      if (
        order.getRequestRevision() != request.revision() ||
        order.getTotalYen() != request.expectedTotalYen() ||
        !prior.details().paymentMethod().equals(request.paymentMethod())
      ) {
        throw new ApiException(409, "REQUEST_REUSED", "同じ注文キーに異なる内容は指定できません。");
      }
      return prior;
    }

    if (cart.getRevision() != request.revision()) {
      throw new ApiException(409, "CART_CHANGED", "別の操作でカートが更新されました。最新の内容を確認してください。");
    }

    var selectedStore = stores.lock(cart.getStoreId()).orElseThrow();
    List<CartItemEntity> items = cartItems.findAllForCart(cartId);
    items
      .stream()
      .map(i -> i.getId().getProductId())
      .sorted()
      .forEach(id -> products.findLocked(id).orElseThrow());
    Map<String, InventoryEntity> lockedStock = lockInventory(cart, items);
    CartView current = cartService.view(cart);
    if (current.items().isEmpty()) throw new ApiException(409, "EMPTY_CART", "カートが空です。");
    if (!current.canCheckout()) {
      throw new ApiException(409, "OUT_OF_STOCK", "在庫が変更されました。数量または受取店舗を変更してください。");
    }
    if (current.totalYen() != request.expectedTotalYen()) {
      throw new ApiException(409, "PRICE_CHANGED", "価格が変更されました。合計金額を確認してください。");
    }

    OrderEntity order = new OrderEntity(
      UUID.randomUUID().toString(),
      cartId,
      requestId,
      request.revision(),
      current.storeName(),
      current.totalYen(),
      current.subtotalYen(),
      current.shippingFeeYen()
    );
    var store = selectedStore;
    if (!store.isEnabled()) throw new ApiException(409, "STORE_DISABLED", "店舗は受付を停止しています。");
    order.assignPickup(auth.current().getId(), store.getId(), store.getAddress(), store.getHours());
    orders.save(order);
    notices.send(order.getBuyerMemberId(), "ご注文を受け付けました", order.getId() + " / " + order.getStoreName());
    notices.toStore(order.getStoreId(), "新しい注文が届きました", order.getId());
    DeliveryFields details = delivery.pickupFields(pickupContacts.findById(auth.current().getId()).orElse(null));
    // Payment is a demo choice: it is recorded on the order, but no payment provider is called.
    details.setPaymentMethod(request.paymentMethod());
    orderDetails.save(new OrderDetailsEntity(order.getId(), details));

    for (CartLine line : current.items()) {
      InventoryEntity stock = lockedStock.get(line.product().id());
      if (stock == null || !stock.getPublicationStatus().equals("PUBLISHED") || stock.getQuantity() < line.quantity()) {
        throw new ApiException(409, "OUT_OF_STOCK", "在庫が変更されました。もう一度確認してください。");
      }
      stock.setQuantity(stock.getQuantity() - line.quantity());
      orderItems.save(
        new OrderItemEntity(
          new OrderItemId(order.getId(), line.product().id()),
          line.product().sku(),
          line.product().name(),
          line.quantity(),
          line.product().priceYen()
        )
      );
    }

    cartItems.deleteAll(items);
    cart.incrementRevision();
    return orderView(order);
  }

  private Map<String, InventoryEntity> lockInventory(CartEntity cart, List<CartItemEntity> items) {
    Map<String, InventoryEntity> locked = new HashMap<>();
    items
      .stream()
      .map(item -> item.getId().getProductId())
      .sorted()
      .forEach(productId ->
        inventory.lockAtStore(cart.getStoreId(), productId).ifPresent(stock -> locked.put(productId, stock))
      );
    return locked;
  }

  private OrderView orderView(OrderEntity order) {
    List<OrderItemEntity> lines = orderItems.findAllForOrder(order.getId());
    DeliveryFields details = orderDetails
      .findById(order.getId())
      .map(OrderDetailsEntity::getDetails)
      .orElseGet(DeliveryFields::empty);
    return orderMapper.toView(order, lines, details);
  }
}
