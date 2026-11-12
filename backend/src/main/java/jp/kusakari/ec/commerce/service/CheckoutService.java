package jp.kusakari.ec.commerce.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;
import jp.kusakari.ec.catalog.dto.ProductStoreReference;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.InventoryRepository;
import jp.kusakari.ec.catalog.persistence.repository.ProductRepository;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CartLine;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CartView;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CheckoutRequest;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CheckoutResult;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderView;
import jp.kusakari.ec.commerce.dto.DeliveryDtos.DetailsView;
import jp.kusakari.ec.commerce.mapper.OrderResponseMapper;
import jp.kusakari.ec.commerce.persistence.entity.CartEntity;
import jp.kusakari.ec.commerce.persistence.entity.CartItemEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderItemEntity;
import jp.kusakari.ec.commerce.persistence.entity.OrderItemId;
import jp.kusakari.ec.commerce.persistence.repository.CartItemRepository;
import jp.kusakari.ec.commerce.persistence.repository.CartRepository;
import jp.kusakari.ec.commerce.persistence.repository.OrderItemRepository;
import jp.kusakari.ec.commerce.persistence.repository.OrderRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(isolation = Isolation.READ_COMMITTED)
public class CheckoutService {

  private final jp.kusakari.ec.auth.AuthService auth;
  private final StoreRepository stores;
  private final OrganizationRepository organizations;
  private final jp.kusakari.ec.notification.service.NotificationService notices;
  private final ProductRepository products;
  private final CartRepository carts;
  private final CartItemRepository cartItems;
  private final OrderRepository orders;
  private final OrderItemRepository orderItems;
  private final InventoryRepository inventory;
  private final CartService cartService;
  private final DeliveryService delivery;
  private final OrderResponseMapper orderMapper;

  /** 手数料の率（1万分率。800 = 8%）。注文ごとに、そのときの率と額を保存する。 */
  @Value("${kusakari.ec.commission-rate-bp:800}")
  private int commissionRateBp;

  public CheckoutResult placeOrder(String cartId, CheckoutRequest request) {
    CartEntity cart = carts
      .findLocked(cartId)
      .orElseThrow(() -> new ApiException(404, "CART_NOT_FOUND", "カートが見つかりません。"));
    String requestId = request.requestId().toString();

    var priorOrders = orders.findByCartIdAndRequestIdOrderByStoreIdAsc(cartId, requestId);
    if (!priorOrders.isEmpty()) {
      if (
        priorOrders.get(0).getRequestRevision() != request.revision() ||
        priorOrders.stream().mapToInt(OrderEntity::getTotalYen).sum() != request.expectedTotalYen() ||
        !priorOrders.get(0).getPaymentMethod().equals(request.paymentMethod())
      ) {
        throw new ApiException(409, "REQUEST_REUSED", "同じ注文キーに異なる内容は指定できません。");
      }
      return new CheckoutResult(priorOrders.stream().map(this::orderView).toList());
    }

    if (cart.getRevision() != request.revision()) {
      throw new ApiException(409, "CART_CHANGED", "別の操作でカートが更新されました。最新の内容を確認してください。");
    }
    List<CartItemEntity> items = cartItems.findAllForCart(cartId);
    if (items.isEmpty()) throw new ApiException(409, "EMPTY_CART", "カートが空です。");

    // Lock in a fixed order (stores by ID, then inventory by product ID) so concurrent checkouts cannot deadlock.
    // 商品の店舗は変わらないので、ロックする店舗はロックの前に読んでよい。
    List<String> productIds = items.stream().map(item -> item.getId().getProductId()).toList();
    Map<Long, StoreEntity> lockedStores = new TreeMap<>();
    products
      .findStoreReferences(productIds)
      .stream()
      .map(ProductStoreReference::storeId)
      .collect(Collectors.toCollection(TreeSet::new))
      .forEach(storeId -> lockedStores.put(storeId, stores.lock(storeId).orElseThrow()));
    Map<String, InventoryEntity> lockedStock = inventory
      .lockAll(productIds)
      .stream()
      .collect(Collectors.toMap(InventoryEntity::getProductId, stock -> stock));
    requireOpen(lockedStores);

    CartView current = cartService.view(cart);
    if (!current.canCheckout()) {
      throw new ApiException(409, "OUT_OF_STOCK", "在庫が変更されました。数量を変更してください。");
    }
    if (current.totalYen() != request.expectedTotalYen()) {
      throw new ApiException(409, "PRICE_CHANGED", "価格が変更されました。合計金額を確認してください。");
    }

    // Issue #70: each line is picked up at its product's store, so one order is created per store.
    // The seller workflow (preparation, pickup, cancellation) stays per store and per order.
    Map<Long, List<CartLine>> linesByStore = current
      .items()
      .stream()
      .collect(Collectors.groupingBy(CartLine::storeId, TreeMap::new, Collectors.toList()));
    // The buyer's pickup contact is copied to every order of this checkout.
    DetailsView details = delivery.pickupDetails(cart.getMemberId(), request.paymentMethod());
    List<OrderView> created = new ArrayList<>();
    for (var group : linesByStore.entrySet()) {
      StoreEntity store = lockedStores.get(group.getKey());
      created.add(orderView(placeStoreOrder(cart, request, store, group.getValue(), lockedStock, details)));
    }

    cartItems.deleteAll(items);
    cart.incrementRevision();
    return new CheckoutResult(created);
  }

  // 受け付けられない店舗の商品が1つでもあれば、どの店舗の注文も作らない。
  private void requireOpen(Map<Long, StoreEntity> lockedStores) {
    Map<Long, Boolean> accepting = organizations
      .findAllById(lockedStores.values().stream().map(StoreEntity::getOrganizationId).collect(Collectors.toSet()))
      .stream()
      .collect(Collectors.toMap(OrganizationEntity::getId, OrganizationEntity::acceptsOrders));
    for (StoreEntity store : lockedStores.values()) {
      if (!store.isOpen() || !accepting.getOrDefault(store.getOrganizationId(), false)) {
        throw new ApiException(409, "STORE_DISABLED", store.getName() + "は受付を停止しています。");
      }
    }
  }

  private OrderEntity placeStoreOrder(
    CartEntity cart,
    CheckoutRequest request,
    StoreEntity store,
    List<CartLine> lines,
    Map<String, InventoryEntity> lockedStock,
    DetailsView details
  ) {
    int total = lines.stream().mapToInt(CartLine::lineTotalYen).sum();
    // Payment is a demo choice: it is recorded on the order, but no payment provider is called.
    OrderEntity order = new OrderEntity(
      UUID.randomUUID().toString(),
      cart.getId(),
      request.requestId().toString(),
      request.revision(),
      store.getName(),
      total,
      commissionRateBp,
      // 1円未満は切り捨てる。
      (int) ((long) total * commissionRateBp / 10000),
      request.paymentMethod()
    );
    order.assignPickup(auth.current().getId(), store.getId(), store.getAddress(), store.getHours());
    order.changeRecipient(details.recipientName(), details.recipientPhone(), details.contactEmail());
    orders.save(order);
    notices.send(order.getBuyerMemberId(), "ご注文を受け付けました", order.getId() + " / " + order.getStoreName());
    notices.toStore(order.getStoreId(), "新しい注文が届きました", order.getId());

    for (CartLine line : lines) {
      InventoryEntity stock = lockedStock.get(line.product().id());
      if (
        stock == null ||
        !stock.getPublicationStatus().equals(InventoryEntity.PUBLISHED) ||
        stock.getQuantity() < line.quantity()
      ) {
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

  private OrderView orderView(OrderEntity order) {
    return orderMapper.toView(order, orderItems.findAllForOrder(order.getId()));
  }
}
