package jp.kusakari.ec.catalog.service;

import static java.util.stream.Collectors.groupingBy;
import static java.util.stream.Collectors.mapping;
import static java.util.stream.Collectors.toSet;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import jp.kusakari.ec.catalog.dto.CatalogDtos.Candidate;
import jp.kusakari.ec.catalog.dto.CatalogDtos.MaterialMatch;
import jp.kusakari.ec.catalog.dto.CatalogDtos.MaterialRequest;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.dto.CatalogDtos.StoreView;
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

  public List<ProductView> products(long storeId) {
    return allProducts(storeId).stream().filter(ProductView::active).toList();
  }

  public List<ProductView> allProducts(long storeId) {
    requireStore(storeId);
    Map<String, Integer> stockByProduct = inventory
      .findAllAtStore(storeId)
      .stream()
      .collect(java.util.stream.Collectors.toMap(row -> row.getId().getProductId(), row -> row.getQuantity()));
    return products
      .findAllByOrderByIdAsc()
      .stream()
      .sorted(
        Comparator.comparingInt((ProductEntity product) -> displayOrder(product.getId())).thenComparing(
          ProductEntity::getId
        )
      )
      .map(product -> mapper.toView(product, stockByProduct.getOrDefault(product.getId(), 0)))
      .toList();
  }

  public ProductView product(String id, long storeId) {
    requireStore(storeId);
    ProductEntity product = products
      .findById(id)
      .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。"));
    int stock = inventory
      .findById(new InventoryId(storeId, id))
      .map(row -> row.getQuantity())
      .orElse(0);
    return mapper.toView(product, stock);
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
    Map<String, ProductView> productsById = products(request.storeId())
      .stream()
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
