package jp.kusakari.ec.catalog.service;

import static java.util.stream.Collectors.groupingBy;
import static java.util.stream.Collectors.mapping;
import static java.util.stream.Collectors.toSet;

import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import jp.kusakari.ec.catalog.dto.CatalogDtos.Candidate;
import jp.kusakari.ec.catalog.dto.CatalogDtos.MaterialMatch;
import jp.kusakari.ec.catalog.dto.CatalogDtos.MaterialRequest;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.dto.CatalogDtos.StoreView;
import jp.kusakari.ec.catalog.dto.ProductImageReference;
import jp.kusakari.ec.catalog.mapper.ProductMapper;
import jp.kusakari.ec.catalog.persistence.entity.InventoryId;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.InventoryRepository;
import jp.kusakari.ec.catalog.persistence.repository.MaterialProductRepository;
import jp.kusakari.ec.catalog.persistence.repository.ProductRepository;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CatalogService {

  private final ProductRepository products;
  private final StoreRepository stores;
  private final InventoryRepository inventory;
  private final MaterialProductRepository materialProducts;
  private final ProductMapper mapper;
  private final jp.kusakari.ec.auth.AuthMemberRepository members;

  public List<ProductView> products(long storeId) {
    return allProducts(storeId).stream().filter(ProductView::active).toList();
  }

  public List<ProductImageReference> imageReferences(List<String> ids) {
    if (Set.copyOf(ids).size() != ids.size()) {
      throw new ApiException(400, "DUPLICATE_PRODUCT", "参照する商品IDが重複しています。");
    }
    var found = products
      .findImageReferences(ids)
      .stream()
      .collect(java.util.stream.Collectors.toMap(ProductImageReference::id, item -> item));
    if (found.size() != ids.size()) {
      throw new ApiException(404, "PRODUCT_NOT_FOUND", "配置に紐づく商品の登録情報が見つかりません。");
    }
    return ids.stream().map(found::get).toList();
  }

  public List<ProductView> allProducts(long storeId) {
    requireStore(storeId);
    return views(products.findAll(), storeId);
  }

  // Purchase flows must not deserialize every product's potentially large 3D manifest.
  public List<ProductView> productsByIds(long storeId, Collection<String> ids) {
    requireStore(storeId);
    return ids.isEmpty() ? List.of() : views(products.findByIdIn(ids), storeId);
  }

  private List<ProductView> views(List<ProductEntity> selected, long storeId) {
    Map<String, jp.kusakari.ec.catalog.persistence.entity.InventoryEntity> stockByProduct = inventory
      .findAllAtStore(storeId)
      .stream()
      .collect(java.util.stream.Collectors.toMap(row -> row.getId().getProductId(), row -> row));
    boolean open = stores.findById(storeId).map(StoreEntity::isEnabled).orElse(false);
    var enabledOwners = members
      .findAll()
      .stream()
      .filter(m -> m.isEnabled())
      .map(m -> m.getId())
      .collect(toSet());
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
        var stock = stockByProduct.get(product.getId());
        return mapper.toView(
          product,
          stock == null ? 0 : stock.getQuantity(),
          stock == null
            ? "DELETED"
            : !open || (product.getOwnerMemberId() != null && !enabledOwners.contains(product.getOwnerMemberId()))
              ? "HIDDEN"
              : stock.getPublicationStatus()
        );
      })
      .toList();
  }

  public ProductView product(String id, long storeId) {
    return productsByIds(storeId, List.of(id))
      .stream()
      .findFirst()
      .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。"));
  }

  public void requireStore(long id) {
    if (!stores.existsById(id)) throw new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。");
  }

  public String storeName(long id) {
    return stores
      .findById(id)
      .map(StoreEntity::getName)
      .orElseThrow(() -> new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。"));
  }

  public List<Long> storeIds() {
    return stores.findAll().stream().map(StoreEntity::getId).toList();
  }

  public List<StoreView> stores(Double latitude, Double longitude) {
    validateCoordinates(latitude, longitude);
    return stores
      .findAllByOrderByIdAsc()
      .stream()
      .map(store ->
        new StoreView(
          store.getId(),
          store.getName(),
          store.getAddress(),
          store.getHours(),
          latitude == null ? null : distance(latitude, longitude, store.getLatitude(), store.getLongitude())
        )
      )
      .sorted(Comparator.comparing(StoreView::distanceKm, Comparator.nullsLast(Double::compareTo)))
      .toList();
  }

  public List<MaterialMatch> match(MaterialRequest request) {
    requireStore(request.storeId());
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
    Map<String, ProductView> productsById = productsByIds(request.storeId(), matchedIds)
      .stream()
      .filter(ProductView::active)
      .collect(java.util.stream.Collectors.toMap(ProductView::id, product -> product));

    return request
      .items()
      .stream()
      .map(item -> {
        List<Candidate> candidates = productIdsByCode
          .getOrDefault(item.materialCode(), Set.of())
          .stream()
          .sorted()
          .map(productsById::get)
          .filter(java.util.Objects::nonNull)
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
