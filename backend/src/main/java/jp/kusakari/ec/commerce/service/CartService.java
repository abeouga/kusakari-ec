package jp.kusakari.ec.commerce.service;

import static jp.kusakari.ec.commerce.dto.CommerceDtos.CartLine;
import static jp.kusakari.ec.commerce.dto.CommerceDtos.CartView;

import java.util.List;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.service.CatalogService;
import jp.kusakari.ec.commerce.dto.CommerceDtos.ItemRequest;
import jp.kusakari.ec.commerce.dto.CommerceDtos.StoreRequest;
import jp.kusakari.ec.commerce.dto.DeliveryDtos.CartDetailsRequest;
import jp.kusakari.ec.commerce.persistence.entity.CartDetailsEntity;
import jp.kusakari.ec.commerce.persistence.entity.CartEntity;
import jp.kusakari.ec.commerce.persistence.entity.CartItemEntity;
import jp.kusakari.ec.commerce.persistence.entity.CartItemId;
import jp.kusakari.ec.commerce.persistence.entity.DeliveryFields;
import jp.kusakari.ec.commerce.persistence.repository.CartDetailsRepository;
import jp.kusakari.ec.commerce.persistence.repository.CartItemRepository;
import jp.kusakari.ec.commerce.persistence.repository.CartRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.shopping.ShoppingDtos.Addition;
import jp.kusakari.ec.shopping.ShoppingDtos.Outcome;
import jp.kusakari.ec.shopping.ShoppingDtos.TransferResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(isolation = Isolation.READ_COMMITTED)
public class CartService {

  private final CartRepository carts;
  private final CartItemRepository items;
  private final CartDetailsRepository cartDetails;
  private final CatalogService catalog;
  private final DeliveryService delivery;

  public CartView read(String id) {
    return view(requireLockedCart(id));
  }

  public CartView updateItem(String id, String productId, ItemRequest request) {
    CartEntity cart = requireLockedCart(id);
    checkRevision(cart, request.revision());
    ProductView product = catalog.product(productId, cart.getStoreId());

    if (request.quantity() > 0 && !product.active()) {
      throw new ApiException(409, "PRODUCT_ARCHIVED", "この商品は販売を終了しています。カートから削除してください。");
    }
    if (request.quantity() > product.stock()) {
      throw new ApiException(409, "OUT_OF_STOCK", "選択した店舗の在庫が不足しています。");
    }

    CartItemId itemId = new CartItemId(id, productId);
    List<CartItemEntity> currentItems = items.findAllForCart(id);
    boolean isNewProduct = currentItems.stream().noneMatch(item -> item.getId().getProductId().equals(productId));
    if (request.quantity() > 0 && isNewProduct && currentItems.size() >= 50) {
      throw new ApiException(400, "CART_LIMIT", "カートは50種類までです。");
    }

    if (request.quantity() == 0) {
      items.findById(itemId).ifPresent(items::delete);
    } else {
      CartItemEntity item = items.findById(itemId).orElseGet(() -> new CartItemEntity(itemId, 0));
      item.setQuantity(request.quantity());
      items.save(item);
    }
    cart.incrementRevision();
    return view(cart);
  }

  public TransferResult addShoppingItems(String id, long revision, long storeId, String gardenId,
                                          String gardenName, List<Addition> additions) {
    CartEntity cart = requireLockedCart(id);
    checkRevision(cart, revision);
    if (cart.getStoreId() != storeId) {
      throw new ApiException(409, "CART_CHANGED", "受取店舗が変更されました。最新の内容を確認してください。");
    }
    var requestedIds = additions.stream().map(Addition::productId).distinct().toList();
    var products = catalog.productsByIds(storeId, requestedIds).stream().collect(Collectors.toMap(ProductView::id, p -> p));
    Map<String, CartItemEntity> current = new LinkedHashMap<>();
    for (var item : items.findAllForCart(id)) current.put(item.getId().getProductId(), item);
    List<Outcome> added = new ArrayList<>();
    List<Outcome> skipped = new ArrayList<>();
    for (var addition : additions) {
      var product = products.get(addition.productId());
      var existing = current.get(addition.productId());
      int next = addition.quantity() + (existing == null ? 0 : existing.getQuantity());
      String code = "";
      String message = "";
      if (product == null || !product.active()) { code = "PRODUCT_ARCHIVED"; message = "販売終了または商品が見つかりません。"; }
      else if (next > 99) { code = "QUANTITY_LIMIT"; message = "追加すると商品数量の上限99点を超えます。"; }
      else if (next > product.stock()) { code = "OUT_OF_STOCK"; message = "選択店舗の在庫が不足しています。"; }
      else if (existing == null && current.size() >= 50) { code = "CART_LIMIT"; message = "カートの商品種類の上限50種類を超えます。"; }
      var outcome = new Outcome(addition.productId(), addition.name(), addition.quantity(), code, message);
      if (!code.isEmpty()) { skipped.add(outcome); continue; }
      var item = existing == null ? new CartItemEntity(new CartItemId(id, addition.productId()), 0) : existing;
      item.setQuantity(next);
      items.save(item);
      current.put(addition.productId(), item);
      added.add(outcome);
    }
    if (!added.isEmpty()) cart.incrementRevision();
    return new TransferResult(view(cart), gardenId, gardenName, added, skipped);
  }

  public CartView updateStore(String id, StoreRequest request) {
    CartEntity cart = requireLockedCart(id);
    checkRevision(cart, request.revision());
    catalog.requireStore(request.storeId());
    cart.selectStore(request.storeId());
    return view(cart);
  }

  public CartView updateDetails(String id, CartDetailsRequest request) {
    CartEntity cart = requireLockedCart(id);
    checkRevision(cart, request.revision());
    cartDetails.save(new CartDetailsEntity(id, delivery.validate(request.details())));
    cart.incrementRevision();
    return view(cart);
  }

  public CartView clearDetails(String id, long revision) {
    CartEntity cart = requireLockedCart(id);
    checkRevision(cart, revision);
    cartDetails.deleteById(id);
    cart.incrementRevision();
    return view(cart);
  }

  public CartView view(CartEntity cart) {
    List<CartItemEntity> cartItems = items.findAllForCart(cart.getId());
    var productIds = cartItems.stream().map(item -> item.getId().getProductId()).toList();
    Map<String, ProductView> products = catalog
      .productsByIds(cart.getStoreId(), productIds)
      .stream()
      .collect(Collectors.toMap(ProductView::id, product -> product));
    List<CartLine> lines = cartItems
      .stream()
      .map(item -> {
        ProductView product = products.get(item.getId().getProductId());
        if (product == null) throw new IllegalStateException("Cart contains an unknown product.");
        int lineTotal = Math.multiplyExact(product.priceYen(), item.getQuantity());
        return new CartLine(
          product,
          item.getQuantity(),
          lineTotal,
          product.active() && product.stock() >= item.getQuantity()
        );
      })
      .toList();

    DeliveryFields details = cartDetails
      .findById(cart.getId())
      .map(CartDetailsEntity::getDetails)
      .orElseGet(DeliveryFields::empty);
    int subtotal = lines.stream().mapToInt(CartLine::lineTotalYen).sum();
    int shipping = lines.isEmpty() ? 0 : delivery.shippingFee(details);
    String storeName = catalog.storeName(cart.getStoreId());

    return new CartView(
      cart.getRevision(),
      cart.getStoreId(),
      storeName,
      lines,
      subtotal + shipping,
      lines.stream().mapToInt(CartLine::quantity).sum(),
      !lines.isEmpty() && lines.stream().allMatch(CartLine::available),
      subtotal,
      shipping,
      delivery.view(details)
    );
  }

  private CartEntity requireLockedCart(String id) {
    return carts.findLocked(id).orElseThrow(() -> new ApiException(404, "CART_NOT_FOUND", "カートが見つかりません。"));
  }

  private static void checkRevision(CartEntity cart, long expected) {
    if (cart.getRevision() != expected) {
      throw new ApiException(409, "CART_CHANGED", "別の操作でカートが更新されました。最新の内容を確認してください。");
    }
  }
}
