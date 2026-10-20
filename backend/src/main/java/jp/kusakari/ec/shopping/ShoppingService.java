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
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ShoppingService {

  private final CanvasShoppingClient canvas;
  private final CatalogService catalog;
  private final MaterialProductRepository materials;
  private final CartService carts;
  private final SavedShoppingItems saved;

  public byte[] thumbnail(String id) {
    return canvas.thumbnail(id);
  }

  public List<Summary> summaries(String cartId) {
    var gardens = new HashSet<>(saved.gardens(cartId));
    return canvas
      .summaries()
      .stream()
      .map(summary -> {
        if (!gardens.contains(summary.gardenId())) return summary;
        var source = supplement(canvas.detail(summary.gardenId()), saved.read(cartId, summary.gardenId()));
        return new Summary(
          summary.gardenId(),
          summary.name(),
          summary.revision(),
          summary.updatedAt(),
          source.items().size(),
          source.items().stream().mapToInt(SourceRow::quantity).sum(),
          summary.thumbnailVersion()
        );
      })
      .toList();
  }

  public Detail add(String gardenId, String productId, String cartId) {
    // Verify garden ownership before saving an EC selection.
    var source = canvas.detail(gardenId);
    saved.add(cartId, gardenId, productId);
    var snapshot = saved.read(cartId, gardenId);
    return resolve(supplement(source, snapshot), carts.read(cartId).storeId(), snapshot.revision());
  }

  public Detail detail(String gardenId, String cartId) {
    long storeId = carts.read(cartId).storeId();
    var source = canvas.detail(gardenId);
    var snapshot = saved.read(cartId, gardenId);
    return resolve(supplement(source, snapshot), storeId, snapshot.revision());
  }

  // Canvas HTTP finishes before acquiring the cart write lock.
  @Transactional(isolation = Isolation.READ_COMMITTED)
  public TransferResult transfer(String gardenId, String cartId, TransferRequest request) {
    var source = canvas.detail(gardenId);
    var snapshot = saved.lockAndRead(cartId, gardenId);
    var cart = carts.read(cartId);
    if (source.revision() != request.gardenRevision()) {
      throw new ApiException(
        409,
        "GARDEN_CHANGED",
        "庭の配置が変更されました。最新の買い物リストから選び直してください。"
      );
    }
    long requestedRevision = request.listRevision() == null ? 0 : request.listRevision();
    if (requestedRevision != snapshot.revision()) throw new ApiException(
      409,
      "SHOPPING_LIST_CHANGED",
      "買い物リストが更新されました。最新の内容から選び直してください。"
    );
    var detail = resolve(supplement(source, snapshot), cart.storeId(), snapshot.revision());
    Map<String, String> selected = new HashMap<>();
    for (var selection : request.items()) {
      if (selected.put(selection.key(), selection.productId()) != null) invalidSelection();
    }
    Map<String, Addition> additions = new LinkedHashMap<>();
    for (var line : detail.items()) {
      String productId = selected.remove(line.key());
      if (productId == null) continue;
      var product = line
        .products()
        .stream()
        .filter(p -> p.id().equals(productId))
        .findFirst()
        .orElseThrow(() -> new ApiException(400, "INVALID_SELECTION", "リストに対応する商品を選択してください。"));
      var previous = additions.get(productId);
      int quantity = line.quantity() + (previous == null ? 0 : previous.quantity());
      additions.put(productId, new Addition(productId, product.name(), quantity));
    }
    if (!selected.isEmpty()) invalidSelection();
    return carts.addShoppingItems(
      cartId,
      request.cartRevision(),
      cart.storeId(),
      gardenId,
      source.name(),
      new ArrayList<>(additions.values())
    );
  }

  private SourceList supplement(SourceList source, SavedShoppingItems.Snapshot snapshot) {
    Map<String, SourceRow> rows = new LinkedHashMap<>();
    source.items().forEach(row -> rows.put(row.key(), row));
    for (var product : snapshot.products()) {
      String key = "product:" + product.id();
      var previous = rows.get(key);
      rows.put(
        key,
        new SourceRow(key, product.name(), product.id(), "", previous == null ? 1 : previous.quantity() + 1, "piece")
      );
    }
    return new SourceList(
      source.gardenId(),
      source.name(),
      source.revision(),
      source.updatedAt(),
      new ArrayList<>(rows.values())
    );
  }

  private Detail resolve(SourceList source, long storeId, long listRevision) {
    Map<String, Set<String>> byCode = new HashMap<>();
    var codes = source
      .items()
      .stream()
      .map(SourceRow::materialCode)
      .filter(c -> c != null && !c.isBlank())
      .toList();
    if (!codes.isEmpty()) {
      for (var mapping : materials.findAllForCodes(codes)) {
        byCode
          .computeIfAbsent(mapping.getId().getMaterialCode(), key -> new TreeSet<>())
          .add(mapping.getId().getProductId());
      }
    }
    Set<String> requestedIds = source
      .items()
      .stream()
      .map(SourceRow::productId)
      .filter(Objects::nonNull)
      .collect(Collectors.toSet());
    byCode.values().forEach(requestedIds::addAll);
    Map<String, ProductView> products = catalog
      .productsByIds(storeId, requestedIds)
      .stream()
      .collect(Collectors.toMap(ProductView::id, p -> p));
    List<Line> lines = new ArrayList<>();
    for (var row : source.items()) {
      Set<String> ids =
        row.productId() == null ? byCode.getOrDefault(row.materialCode(), Set.of()) : Set.of(row.productId());
      var candidates = ids
        .stream()
        .map(products::get)
        .filter(Objects::nonNull)
        .map(p -> new Product(p.id(), p.name(), p.imageUrl(), p.priceYen(), p.stock(), p.active()))
        .toList();
      lines.add(new Line(row.key(), row.name(), row.quantity(), row.unit(), candidates));
    }
    return new Detail(
      source.gardenId(),
      source.name(),
      source.revision(),
      source.updatedAt(),
      storeId,
      catalog.storeName(storeId),
      lines,
      listRevision
    );
  }

  private void invalidSelection() {
    throw new ApiException(400, "INVALID_SELECTION", "買い物リストの選択内容が不正です。");
  }
}
