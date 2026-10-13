package jp.kusakari.ec.commerce.service;

import static jp.kusakari.ec.commerce.dto.CommerceDtos.CartLine;
import static jp.kusakari.ec.commerce.dto.CommerceDtos.CartView;

import java.util.List;
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
    ProductView product = catalog
      .allProducts(cart.getStoreId())
      .stream()
      .filter(candidate -> candidate.id().equals(productId))
      .findFirst()
      .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。"));

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
    Map<String, ProductView> products = catalog
      .allProducts(cart.getStoreId())
      .stream()
      .collect(Collectors.toMap(ProductView::id, product -> product));
    List<CartLine> lines = items
      .findAllForCart(cart.getId())
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
