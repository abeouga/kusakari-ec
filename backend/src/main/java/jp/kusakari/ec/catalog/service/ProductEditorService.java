package jp.kusakari.ec.catalog.service;

import jakarta.persistence.EntityManager;
import java.util.UUID;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.dto.ProductRequest;
import jp.kusakari.ec.catalog.mapper.ProductMapper;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import jp.kusakari.ec.catalog.persistence.entity.MaterialProductEntity;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import jp.kusakari.ec.catalog.persistence.repository.InventoryRepository;
import jp.kusakari.ec.catalog.persistence.repository.MaterialProductRepository;
import jp.kusakari.ec.catalog.persistence.repository.ProductRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ProductEditorService {

  private final CategoryService categories;
  private final ProductRepository products;
  private final InventoryRepository inventory;
  private final CatalogService catalog;
  private final ProductMapper mapper;
  private final EntityManager entityManager;
  private final CanvasModelClient models;
  private final MaterialProductRepository materials;
  private final jp.kusakari.ec.auth.AuthService auth;
  private final ProductSkuGenerator skus;

  public ProductView create(ProductRequest input) {
    auth.requireManager(input.getStoreId());
    catalog.requireStore(input.getStoreId());
    categories.require(input.getCategory());
    // A new product is listed with at least one in stock; only an edit may set 0 to mark it sold out (issue #72).
    if (input.getStock() < 1) throw new ApiException(400, "STOCK_REQUIRED", "在庫は1以上にしてください。");
    ProductEntity product = mapper.toEntity(input);
    product.setId(UUID.randomUUID().toString());
    // 商品番号は店舗の中で一意なので、重複も店舗の中だけで確かめる。
    if (product.getSku() == null || product.getSku().isBlank()) product.setSku(skus.next(input.getStoreId()));
    else if (products.existsByStoreIdAndSku(input.getStoreId(), product.getSku())) throw duplicateSku();
    resolveModel(product, input, null, true);
    saveProduct(product, true);
    inventory.save(new InventoryEntity(product.getId(), input.getStock()));
    linkMaterial(product);
    return catalog.product(product.getId());
  }

  public ProductView update(String id, ProductRequest input) {
    categories.require(input.getCategory());
    ProductEntity product = products
      .findLocked(id)
      .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。"));
    // 商品の編集（価格を含む）は STAFF もできる。登録と削除はオーナーか MANAGER だけ（#105）。
    auth.requireProductStore(product.getStoreId(), false);
    // 注文の店舗と商品の店舗を一致させるため、商品をほかの店舗へ移すことはできない。
    if (!product.getStoreId().equals(input.getStoreId())) {
      throw new ApiException(400, "STORE_IMMUTABLE", "商品の店舗は変更できません。");
    }
    // The product number is assigned on registration and cannot be changed afterwards (issue #46).
    if (input.getSku() == null || input.getSku().isBlank()) input.setSku(product.getSku());
    else if (!input.getSku().equals(product.getSku())) {
      throw new ApiException(409, "SKU_IMMUTABLE", "商品番号は変更できません。");
    }
    // Check the store stock before changing anything: a form opened before an order or a cancellation
    // restock must not overwrite the current quantity (EC-S05 5b).
    InventoryEntity stock = inventory.lock(id).orElse(null);
    if (stock == null || stock.getPublicationStatus().equals(InventoryEntity.DELETED)) {
      throw new ApiException(409, "PRODUCT_ARCHIVED", "削除済みの商品は編集できません。");
    }
    int expected = input.getExpectedStock() == null ? input.getStock() : input.getExpectedStock();
    if (stock.getQuantity() != expected) throw SellerProductService.stockChanged(stock.getQuantity());
    var previousProfile = product.getPlantModelProfile();
    boolean profileProvided = input.isPlantModelProfileProvided();
    if (!input.isPlantModelProfileProvided()) input.setPlantModelProfile(previousProfile);
    mapper.updateEntity(input, product);
    resolveModel(product, input, previousProfile, profileProvided);
    saveProduct(product, false);

    stock.setQuantity(input.getStock());
    inventory.save(stock);
    linkMaterial(product);
    return catalog.product(id);
  }

  private void resolveModel(
    ProductEntity product,
    ProductRequest input,
    jp.kusakari.ec.catalog.dto.PlantModelProfile previous,
    boolean profileProvided
  ) {
    var profile = input.getPlantModelProfile();
    if (profile == null) {
      product.setModelComposition(null);
      return;
    }
    if (input.getHeightCm() == null || Double.compare(profile.getHeightCm(), input.getHeightCm()) != 0) {
      throw new ApiException(400, "PLANT_HEIGHT_MISMATCH", "商品の高さと植物モデルの高さを一致させてください。");
    }
    if (
      !profile.equals(previous) ||
      product.getModelComposition() == null ||
      (profileProvided && product.getModelComposition().path("version").asInt() < 4)
    ) {
      product.setModelComposition(models.resolve(profile));
    }
  }

  private void linkMaterial(ProductEntity product) {
    if (product.getModelComposition() != null) {
      materials.save(new MaterialProductEntity("product." + product.getId(), product.getId()));
    }
  }

  /** 商品の行は注文や庭の記録から参照されるので消さず、在庫の公開状態を DELETED にする。 */
  public void delete(String id) {
    var product = products
      .findLocked(id)
      .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。"));
    auth.requireProductStore(product.getStoreId(), true);
    InventoryEntity stock = inventory.lock(id).orElseGet(() -> new InventoryEntity(id, 0));
    stock.setPublicationStatus(InventoryEntity.DELETED);
    inventory.save(stock);
  }

  private void saveProduct(ProductEntity product, boolean isNew) {
    try {
      if (isNew) entityManager.persist(product);
      entityManager.flush();
    } catch (DataIntegrityViolationException error) {
      throw duplicateSku();
    }
  }

  private static ApiException duplicateSku() {
    return new ApiException(409, "SKU_EXISTS", "この商品番号は既に使われています。");
  }
}
