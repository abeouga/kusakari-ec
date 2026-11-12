package jp.kusakari.ec.commerce.service;

import static jp.kusakari.ec.commerce.dto.CommerceDtos.CartLine;
import static jp.kusakari.ec.commerce.dto.CommerceDtos.CartView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.service.CatalogService;
import jp.kusakari.ec.catalog.service.CatalogService.Listing;
import jp.kusakari.ec.commerce.dto.CommerceDtos.ItemRequest;
import jp.kusakari.ec.commerce.persistence.entity.CartEntity;
import jp.kusakari.ec.commerce.persistence.entity.CartItemEntity;
import jp.kusakari.ec.commerce.persistence.entity.CartItemId;
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
  private final CatalogService catalog;
  private final DeliveryService delivery;

  public CartView read(String id) {
    return view(requireLockedCart(id));
  }

  public CartView updateItem(String id, String productId, ItemRequest request) {
    CartEntity cart = requireLockedCart(id);
    checkRevision(cart, request.revision());
    CartItemId itemId = new CartItemId(id, productId);
    var existing = items.findById(itemId);
    // 在庫と受取店舗は、商品の店舗のもの。
    Listing listing = catalog.listing(productId);

    if (request.quantity() > 0 && !listing.purchasable()) {
      throw new ApiException(409, "PRODUCT_ARCHIVED", "この商品は販売を終了しています。カートから削除してください。");
    }
    if (request.quantity() > listing.product().stock()) {
      throw new ApiException(409, "OUT_OF_STOCK", "受取店舗の在庫が不足しています。");
    }

    List<CartItemEntity> currentItems = items.findAllForCart(id);
    boolean isNewProduct = currentItems.stream().noneMatch(item -> item.getId().getProductId().equals(productId));
    if (request.quantity() > 0 && isNewProduct && currentItems.size() >= 50) {
      throw new ApiException(400, "CART_LIMIT", "カートは50種類までです。");
    }

    if (request.quantity() == 0) {
      existing.ifPresent(items::delete);
    } else {
      CartItemEntity item = existing.orElseGet(() -> new CartItemEntity(itemId, 0));
      item.setQuantity(request.quantity());
      items.save(item);
    }
    cart.incrementRevision();
    return view(cart);
  }

  public TransferResult addShoppingItems(
    String id,
    long revision,
    String gardenId,
    String gardenName,
    List<Addition> additions
  ) {
    CartEntity cart = requireLockedCart(id);
    checkRevision(cart, revision);
    var requestedIds = additions.stream().map(Addition::productId).distinct().toList();
    Map<String, CartItemEntity> current = new LinkedHashMap<>();
    for (var item : items.findAllForCart(id)) current.put(item.getId().getProductId(), item);
    Map<String, Listing> listings = listingsById(requestedIds);
    List<Outcome> added = new ArrayList<>();
    List<Outcome> skipped = new ArrayList<>();
    for (var addition : additions) {
      var listing = listings.get(addition.productId());
      var existing = current.get(addition.productId());
      int next = addition.quantity() + (existing == null ? 0 : existing.getQuantity());
      String code = "";
      String message = "";
      if (listing == null || !listing.purchasable()) {
        code = "PRODUCT_ARCHIVED";
        message = "販売終了または商品が見つかりません。";
      } else if (next > 99) {
        code = "QUANTITY_LIMIT";
        message = "追加すると商品数量の上限99点を超えます。";
      } else if (next > listing.product().stock()) {
        code = "OUT_OF_STOCK";
        message = "受取店舗の在庫が不足しています。";
      } else if (existing == null && current.size() >= 50) {
        code = "CART_LIMIT";
        message = "カートの商品種類の上限50種類を超えます。";
      }
      var outcome = new Outcome(addition.productId(), addition.name(), addition.quantity(), code, message);
      if (!code.isEmpty()) {
        skipped.add(outcome);
        continue;
      }
      var item = existing == null ? new CartItemEntity(new CartItemId(id, addition.productId()), 0) : existing;
      item.setQuantity(next);
      items.save(item);
      current.put(addition.productId(), item);
      added.add(outcome);
    }
    if (!added.isEmpty()) cart.incrementRevision();
    return new TransferResult(view(cart), gardenId, gardenName, added, skipped);
  }

  public CartView view(CartEntity cart) {
    List<CartItemEntity> cartItems = items.findAllForCart(cart.getId());
    Map<String, Listing> listings = listingsById(cartItems.stream().map(item -> item.getId().getProductId()).toList());
    List<CartLine> lines = cartItems
      .stream()
      .map(item -> {
        Listing listing = listings.get(item.getId().getProductId());
        if (listing == null) throw new IllegalStateException("Cart contains an unknown product.");
        ProductView product = listing.product();
        return new CartLine(
          product,
          item.getQuantity(),
          Math.multiplyExact(product.priceYen(), item.getQuantity()),
          listing.purchasable() && product.stock() >= item.getQuantity(),
          product.sellerStoreId(),
          product.sellerStoreName()
        );
      })
      .toList();

    // 店舗受け取りだけで送料がないので、小計と合計は同じ。
    int total = lines.stream().mapToInt(CartLine::lineTotalYen).sum();

    return new CartView(
      cart.getRevision(),
      lines,
      total,
      lines.stream().mapToInt(CartLine::quantity).sum(),
      !lines.isEmpty() && lines.stream().allMatch(CartLine::available),
      total,
      delivery.pickupDetails(cart.getMemberId(), "NONE")
    );
  }

  private Map<String, Listing> listingsById(List<String> productIds) {
    return catalog
      .listingsByIds(productIds)
      .stream()
      .collect(Collectors.toMap(listing -> listing.product().id(), listing -> listing));
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
