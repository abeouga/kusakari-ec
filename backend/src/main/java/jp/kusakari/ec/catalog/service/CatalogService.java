package jp.kusakari.ec.catalog.service;

import static java.util.stream.Collectors.groupingBy;
import static java.util.stream.Collectors.mapping;
import static java.util.stream.Collectors.toMap;
import static java.util.stream.Collectors.toSet;

import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import jp.kusakari.ec.catalog.dto.CatalogDtos.Candidate;
import jp.kusakari.ec.catalog.dto.CatalogDtos.MaterialMatch;
import jp.kusakari.ec.catalog.dto.CatalogDtos.MaterialRequest;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductReferenceView;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.dto.CatalogDtos.StoreView;
import jp.kusakari.ec.catalog.dto.ProductImageReference;
import jp.kusakari.ec.catalog.dto.ProductStoreReference;
import jp.kusakari.ec.catalog.mapper.ProductMapper;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.InventoryRepository;
import jp.kusakari.ec.catalog.persistence.repository.MaterialProductRepository;
import jp.kusakari.ec.catalog.persistence.repository.ProductRepository;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CatalogService {

  private final ProductRepository products;
  private final StoreRepository stores;
  private final OrganizationRepository organizations;
  private final InventoryRepository inventory;
  private final MaterialProductRepository materialProducts;
  private final ProductMapper mapper;

  // 買えない理由。前の4つは、もう戻らない（または戻しても外した明細は戻さない）ので、カートの明細と庭の配置から外す。
  public static final String DELETED = "DELETED";
  public static final String STORE_CLOSED = "STORE_CLOSED";
  public static final String STORE_SUSPENDED = "STORE_SUSPENDED";
  public static final String ORGANIZATION_SUSPENDED = "ORGANIZATION_SUSPENDED";
  // 後の理由は一時的なので外さず、「購入できません」と出す。
  public static final String STORE_CLOSING = "STORE_CLOSING";
  public static final String STORE_UNPUBLISHED = "STORE_UNPUBLISHED";
  public static final String ORGANIZATION_NOT_ACCEPTING = "ORGANIZATION_NOT_ACCEPTING";
  public static final String PRODUCT_SUSPENDED = "PRODUCT_SUSPENDED";
  public static final String HIDDEN = "HIDDEN";
  public static final String OUT_OF_STOCK = "OUT_OF_STOCK";
  public static final Set<String> REMOVED_REASONS = Set.of(DELETED, STORE_CLOSED, STORE_SUSPENDED, ORGANIZATION_SUSPENDED);

  /**
   * 商品と、購入者に見えて今買えるか。見えるのは、店舗が開いていて、組織が受付を止めておらず、
   * 運営が商品を停止しておらず、出店者が公開している商品だけ。unavailableReason は買えない理由（買えるなら null）。
   * 在庫数はここでは見ない（在庫0の商品も一覧には出す）。
   */
  public record Listing(ProductView product, String unavailableReason) {
    public boolean purchasable() {
      return unavailableReason == null;
    }
  }

  /** reason は店舗・組織の側で買えない理由（買えるなら null）。 */
  private record StoreState(String name, String reason) {}

  /** storeId が null なら、購入者に見える全店舗の商品。 */
  public List<ProductView> products(Long storeId) {
    if (storeId != null) requireStore(storeId);
    var selected = storeId == null ? products.findAllNotDeleted() : products.findNotDeletedAtStore(storeId);
    return listings(selected).stream().filter(Listing::purchasable).map(Listing::product).toList();
  }

  /** 出店者の一覧。非公開の商品も含む、その店舗の削除されていない商品。 */
  public List<ProductView> storeProducts(long storeId) {
    requireStore(storeId);
    return listings(products.findNotDeletedAtStore(storeId)).stream().map(Listing::product).toList();
  }

  // Purchase flows must not deserialize every product's potentially large 3D manifest.
  public List<Listing> listingsByIds(Collection<String> ids) {
    return ids.isEmpty() ? List.of() : listings(products.findByIdIn(ids));
  }

  public Listing listing(String id) {
    return listingsByIds(List.of(id))
      .stream()
      .findFirst()
      .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。"));
  }

  public ProductView product(String id) {
    return listing(id).product();
  }

  public List<ProductReferenceView> imageReferences(List<String> ids) {
    if (Set.copyOf(ids).size() != ids.size()) {
      throw new ApiException(400, "DUPLICATE_PRODUCT", "参照する商品IDが重複しています。");
    }
    Map<String, ProductImageReference> found = products
      .findImageReferences(ids)
      .stream()
      .collect(toMap(ProductImageReference::id, item -> item));
    if (found.size() != ids.size()) {
      throw new ApiException(404, "PRODUCT_NOT_FOUND", "配置に紐づく商品の登録情報が見つかりません。");
    }
    Map<String, ProductStoreReference> owners = products
      .findStoreReferences(ids)
      .stream()
      .collect(toMap(ProductStoreReference::id, item -> item));
    Map<String, InventoryEntity> stockByProduct = stockByProduct(ids);
    Map<Long, StoreState> states = storeStates(
      owners.values().stream().map(ProductStoreReference::storeId).collect(toSet())
    );
    return ids
      .stream()
      .map(id -> {
        ProductImageReference reference = found.get(id);
        ProductStoreReference owner = owners.get(id);
        InventoryEntity stock = stockByProduct.get(id);
        StoreState store = states.get(owner.storeId());
        // 照会では在庫0も買えない理由に含める（庭は配置を残し「在庫なし」と出す）。
        String reason = unavailableReason(store, owner.suspended(), stock);
        if (reason == null && stock.getQuantity() <= 0) reason = OUT_OF_STOCK;
        return new ProductReferenceView(
          reference.id(),
          reference.name(),
          reference.imageUrl(),
          reference.active(),
          reference.hasPlantModel(),
          owner.storeId(),
          store == null ? "" : store.name(),
          stock == null ? 0 : stock.getQuantity(),
          reason == null,
          reason
        );
      })
      .toList();
  }

  private List<Listing> listings(List<ProductEntity> selected) {
    Map<String, InventoryEntity> stockByProduct = stockByProduct(selected.stream().map(ProductEntity::getId).toList());
    Map<Long, StoreState> states = storeStates(selected.stream().map(ProductEntity::getStoreId).collect(toSet()));
    return selected
      // Sorting JSON model manifests in MySQL can exhaust its per-query sort buffer.
      // The comparator below already provides the complete, deterministic display order.
      .stream()
      .sorted(
        Comparator.comparingInt((ProductEntity product) -> displayOrder(product.getId())).thenComparing(
          ProductEntity::getId
        )
      )
      .map(product -> {
        InventoryEntity stock = stockByProduct.get(product.getId());
        StoreState store = states.get(product.getStoreId());
        return new Listing(
          mapper.toView(
            product,
            stock == null ? 0 : stock.getQuantity(),
            stock == null ? InventoryEntity.DELETED : stock.getPublicationStatus(),
            store == null ? "" : store.name()
          ),
          unavailableReason(store, product.isSuspended(), stock)
        );
      })
      .toList();
  }

  private static String unavailableReason(StoreState store, boolean suspended, InventoryEntity stock) {
    if (store == null || stock == null || InventoryEntity.DELETED.equals(stock.getPublicationStatus())) return DELETED;
    if (store.reason() != null) return store.reason();
    if (suspended) return PRODUCT_SUSPENDED;
    if (!InventoryEntity.PUBLISHED.equals(stock.getPublicationStatus())) return HIDDEN;
    return null;
  }

  private Map<String, InventoryEntity> stockByProduct(Collection<String> productIds) {
    return inventory.findAllById(productIds).stream().collect(toMap(InventoryEntity::getProductId, row -> row));
  }

  // 店舗が開いていても、組織が受付停止中・停止なら、その店舗の商品は購入者に見せない。
  private Map<Long, StoreState> storeStates(Collection<Long> storeIds) {
    List<StoreEntity> selected = stores.findAllById(storeIds);
    Map<Long, OrganizationEntity> owners = organizations
      .findAllById(selected.stream().map(StoreEntity::getOrganizationId).collect(toSet()))
      .stream()
      .collect(toMap(OrganizationEntity::getId, organization -> organization));
    return selected
      .stream()
      .collect(
        toMap(StoreEntity::getId, store ->
          new StoreState(store.getName(), storeReason(store, owners.get(store.getOrganizationId())))
        )
      );
  }

  // 戻らない理由（閉鎖済み・停止）を先に見る。閉鎖中・非公開・受付停止中は、一時的な理由として扱う。
  private static String storeReason(StoreEntity store, OrganizationEntity organization) {
    if (store.getClosedAt() != null) return STORE_CLOSED;
    if (store.isSuspended()) return STORE_SUSPENDED;
    if (organization == null || organization.isSuspended()) return ORGANIZATION_SUSPENDED;
    if (store.getClosingStartedAt() != null) return STORE_CLOSING;
    if (!store.isPublished()) return STORE_UNPUBLISHED;
    if (!organization.acceptsOrders()) return ORGANIZATION_NOT_ACCEPTING;
    return null;
  }

  public void requireStore(long id) {
    if (!stores.existsById(id)) throw new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。");
  }

  public List<StoreView> stores(Double latitude, Double longitude) {
    validateCoordinates(latitude, longitude);
    // EC-B12: suspended stores are not offered as pickup candidates; checkout still rejects them.
    return stores
      .findOpen()
      .stream()
      .map(store ->
        new StoreView(
          store.getId(),
          store.getName(),
          store.getAddress(),
          store.getHours(),
          store.getLatitude(),
          store.getLongitude(),
          latitude == null || !store.hasLocation()
            ? null
            : distance(latitude, longitude, store.getLatitude(), store.getLongitude())
        )
      )
      .sorted(Comparator.comparing(StoreView::distanceKm, Comparator.nullsLast(Double::compareTo)))
      .toList();
  }

  public List<MaterialMatch> match(MaterialRequest request) {
    if (request.storeId() != null) requireStore(request.storeId());
    Map<String, Set<String>> productIdsByCode = materialProducts
      .findAllForCodes(
        request
          .items()
          .stream()
          .map(item -> item.materialCode())
          .collect(toSet())
      )
      .stream()
      .collect(groupingBy(row -> row.getId().getMaterialCode(), mapping(row -> row.getId().getProductId(), toSet())));
    Set<String> matchedIds = productIdsByCode.values().stream().flatMap(Set::stream).collect(toSet());
    Map<String, ProductView> productsById = listingsByIds(matchedIds)
      .stream()
      .filter(Listing::purchasable)
      .map(Listing::product)
      .filter(product -> request.storeId() == null || request.storeId().equals(product.sellerStoreId()))
      .collect(toMap(ProductView::id, product -> product));

    return request
      .items()
      .stream()
      .map(item -> {
        List<Candidate> candidates = productIdsByCode
          .getOrDefault(item.materialCode(), Set.of())
          .stream()
          .sorted()
          .map(productsById::get)
          .filter(Objects::nonNull)
          .map(product ->
            new Candidate(
              product,
              item.quantity(),
              Math.multiplyExact(product.priceYen(), item.quantity()),
              product.stock() >= item.quantity()
            )
          )
          .toList();
        return new MaterialMatch(item.materialCode(), candidates.isEmpty() ? "UNMAPPED" : "MATCHED", candidates);
      })
      .toList();
  }

  private static void validateCoordinates(Double latitude, Double longitude) {
    if (
      (latitude == null) != (longitude == null) ||
      (latitude != null &&
        (!Double.isFinite(latitude) ||
          !Double.isFinite(longitude) ||
          Math.abs(latitude) > 90 ||
          Math.abs(longitude) > 180))
    ) {
      throw new ApiException(400, "INVALID_LOCATION", "緯度・経度を正しく指定してください。");
    }
  }

  private static double distance(double lat1, double lon1, double lat2, double lon2) {
    double a =
      Math.pow(Math.sin(Math.toRadians(lat2 - lat1) / 2), 2) +
      Math.cos(Math.toRadians(lat1)) *
        Math.cos(Math.toRadians(lat2)) *
        Math.pow(Math.sin(Math.toRadians(lon2 - lon1) / 2), 2);
    return Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) * 10.0) / 10.0;
  }

  private static int displayOrder(String id) {
    return switch (id) {
      case "olive" -> 0;
      case "lavender" -> 1;
      case "rosemary" -> 2;
      case "monstera" -> 3;
      default -> 4;
    };
  }
}
