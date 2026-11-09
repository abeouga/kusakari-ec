package jp.kusakari.ec.commerce.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.InventoryRepository;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CartLine;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CartView;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CheckoutRequest;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CheckoutResult;
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

  public CheckoutResult placeOrder(String cartId, CheckoutRequest request) {
    CartEntity cart = carts
      .findLocked(cartId)
      .orElseThrow(() -> new ApiException(404, "CART_NOT_FOUND", "カートが見つかりません。"));
    String requestId = request.requestId().toString();

    var priorOrders = orders.findByCartIdAndRequestIdOrderByStoreIdAsc(cartId, requestId);
    if (!priorOrders.isEmpty()) {
      List<OrderView> prior = priorOrders.stream().map(this::orderView).toList();
      if (
        priorOrders.get(0).getRequestRevision() != request.revision() ||
        priorOrders.stream().mapToInt(OrderEntity::getTotalYen).sum() != request.expectedTotalYen() ||
        !prior.get(0).details().paymentMethod().equals(request.paymentMethod())
      ) {
        throw new ApiException(409, "REQUEST_REUSED", "同じ注文キーに異なる内容は指定できません。");
      }
      return new CheckoutResult(prior);
    }

    if (cart.getRevision() != request.revision()) {
      throw new ApiException(409, "CART_CHANGED", "別の操作でカートが更新されました。最新の内容を確認してください。");
    }

    // Lock in a fixed order (stores, products, inventory; each sorted) so concurrent checkouts cannot deadlock.
    List<CartItemEntity> items = cartItems.findAllForCart(cartId);
    Map<Long, StoreEntity> lockedStores = new TreeMap<>();
    items
      .stream()
      .map(item -> item.pickupStoreId(cart))
      .distinct()
      .sorted()
      .forEach(storeId -> lockedStores.put(storeId, stores.lock(storeId).orElseThrow()));
    items
      .stream()
      .map(i -> i.getId().getProductId())
      .sorted()
      .forEach(id -> products.findLocked(id).orElseThrow());
    Map<String, InventoryEntity> lockedStock = lockInventory(cart, items);
    CartView current = cartService.view(cart);
    if (current.items().isEmpty()) throw new ApiException(409, "EMPTY_CART", "カートが空です。");
    if (!current.canCheckout()) {
      throw new ApiException(409, "OUT_OF_STOCK", "在庫が変更されました。数量を変更してください。");
    }
    if (current.totalYen() != request.expectedTotalYen()) {
      throw new ApiException(409, "PRICE_CHANGED", "価格が変更されました。合計金額を確認してください。");
    }

    // Issue #70: each line is picked up at its own store, so one order is created per pickup store.
    // The seller workflow (preparation, pickup, cancellation) stays per store and per order.
    Map<Long, List<CartLine>> linesByStore = current
      .items()
      .stream()
      .collect(Collectors.groupingBy(CartLine::storeId, TreeMap::new, Collectors.toList()));
    List<OrderView> created = new ArrayList<>();
    int shippingFee = current.shippingFeeYen();
    for (var group : linesByStore.entrySet()) {
      StoreEntity store = lockedStores.get(group.getKey());
      created.add(orderView(placeStoreOrder(cart, request, store, group.getValue(), lockedStock, shippingFee)));
      // Pickup is free today; any fee is charged once so the orders add up to the confirmed cart total.
      shippingFee = 0;
    }

    cartItems.deleteAll(items);
    cart.incrementRevision();
    return new CheckoutResult(created);
  }

  private OrderEntity placeStoreOrder(
    CartEntity cart,
    CheckoutRequest request,
    StoreEntity store,
    List<CartLine> lines,
    Map<String, InventoryEntity> lockedStock,
    int shippingFee
  ) {
    if (!store.isEnabled()) {
      throw new ApiException(409, "STORE_DISABLED", store.getName() + "は受付を停止しています。");
    }
    int subtotal = lines.stream().mapToInt(CartLine::lineTotalYen).sum();
    OrderEntity order = new OrderEntity(
      UUID.randomUUID().toString(),
      cart.getId(),
      request.requestId().toString(),
      request.revision(),
      store.getName(),
      subtotal + shippingFee,
      subtotal,
      shippingFee
    );
    order.assignPickup(auth.current().getId(), store.getId(), store.getAddress(), store.getHours());
    orders.save(order);
    notices.send(order.getBuyerMemberId(), "ご注文を受け付けました", order.getId() + " / " + order.getStoreName());
    notices.toStore(order.getStoreId(), "新しい注文が届きました", order.getId());
    DeliveryFields details = delivery.pickupFields(pickupContacts.findById(auth.current().getId()).orElse(null));
    // Payment is a demo choice: it is recorded on the order, but no payment provider is called.
    details.setPaymentMethod(request.paymentMethod());
    orderDetails.save(new OrderDetailsEntity(order.getId(), details));

    for (CartLine line : lines) {
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
    return order;
  }

  // Each line's stock is taken from its own pickup store.
  private Map<String, InventoryEntity> lockInventory(CartEntity cart, List<CartItemEntity> items) {
    Map<String, InventoryEntity> locked = new HashMap<>();
    items
      .stream()
      .sorted(
        Comparator.comparing((CartItemEntity item) -> item.pickupStoreId(cart)).thenComparing(item ->
          item.getId().getProductId()
        )
      )
      .forEach(item ->
        inventory
          .lockAtStore(item.pickupStoreId(cart), item.getId().getProductId())
          .ifPresent(stock -> locked.put(item.getId().getProductId(), stock))
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
