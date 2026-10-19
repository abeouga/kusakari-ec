package jp.kusakari.ec.shopping;

import java.util.*;
import java.util.stream.Collectors;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.persistence.repository.MaterialProductRepository;
import jp.kusakari.ec.catalog.service.CatalogService;
import jp.kusakari.ec.commerce.service.CartService;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.shopping.ShoppingDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ShoppingService {
  private final CanvasShoppingClient canvas;
  private final CatalogService catalog;
  private final MaterialProductRepository materials;
  private final CartService carts;

  public byte[] thumbnail(String id) { return canvas.thumbnail(id); }

  public List<Summary> summaries() { return canvas.summaries(); }

  public Detail detail(String gardenId, String cartId) {
    long storeId = carts.read(cartId).storeId();
    return resolve(canvas.detail(gardenId), storeId);
  }

  // Canvas HTTP finishes before acquiring the cart write lock.
  public TransferResult transfer(String gardenId, String cartId, TransferRequest request) {
    var cart = carts.read(cartId);
    var source = canvas.detail(gardenId);
    if (source.revision() != request.gardenRevision()) {
      throw new ApiException(409, "GARDEN_CHANGED", "庭の配置が変更されました。最新の買い物リストから選び直してください。");
    }
    var detail = resolve(source, cart.storeId());
    Map<String, String> selected = new HashMap<>();
    for (var selection : request.items()) {
      if (selected.put(selection.key(), selection.productId()) != null) invalidSelection();
    }
    Map<String, Addition> additions = new LinkedHashMap<>();
    for (var line : detail.items()) {
      String productId = selected.remove(line.key());
      if (productId == null) continue;
      var product = line.products().stream().filter(p -> p.id().equals(productId)).findFirst()
        .orElseThrow(() -> new ApiException(400, "INVALID_SELECTION", "リストに対応する商品を選択してください。"));
      var previous = additions.get(productId);
      int quantity = line.quantity() + (previous == null ? 0 : previous.quantity());
      additions.put(productId, new Addition(productId, product.name(), quantity));
    }
    if (!selected.isEmpty()) invalidSelection();
    return carts.addShoppingItems(cartId, request.cartRevision(), cart.storeId(), gardenId,
      source.name(), new ArrayList<>(additions.values()));
  }

  private Detail resolve(SourceList source, long storeId) {
    Map<String, Set<String>> byCode = new HashMap<>();
    var codes = source.items().stream().map(SourceRow::materialCode).filter(c -> c != null && !c.isBlank()).toList();
    if (!codes.isEmpty()) {
      for (var mapping : materials.findAllForCodes(codes)) {
        byCode.computeIfAbsent(mapping.getId().getMaterialCode(), key -> new TreeSet<>())
          .add(mapping.getId().getProductId());
      }
    }
    Set<String> requestedIds = source.items().stream().map(SourceRow::productId)
      .filter(Objects::nonNull).collect(Collectors.toSet());
    byCode.values().forEach(requestedIds::addAll);
    Map<String, ProductView> products = catalog.productsByIds(storeId, requestedIds).stream()
      .collect(Collectors.toMap(ProductView::id, p -> p));
    List<Line> lines = new ArrayList<>();
    for (var row : source.items()) {
      Set<String> ids = row.productId() == null ? byCode.getOrDefault(row.materialCode(), Set.of()) : Set.of(row.productId());
      var candidates = ids.stream().map(products::get).filter(Objects::nonNull)
        .map(p -> new Product(p.id(), p.name(), p.imageUrl(), p.priceYen(), p.stock(), p.active())).toList();
      lines.add(new Line(row.key(), row.name(), row.quantity(), row.unit(), candidates));
    }
    return new Detail(source.gardenId(), source.name(), source.revision(), source.updatedAt(),
      storeId, catalog.storeName(storeId), lines);
  }
  private void invalidSelection() {
    throw new ApiException(400, "INVALID_SELECTION", "買い物リストの選択内容が不正です。");
  }
}
