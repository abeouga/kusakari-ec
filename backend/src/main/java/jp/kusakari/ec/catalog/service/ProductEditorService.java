package jp.kusakari.ec.catalog.service;

import jakarta.persistence.EntityManager;
import java.util.UUID;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.dto.ProductRequest;
import jp.kusakari.ec.catalog.mapper.ProductMapper;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import jp.kusakari.ec.catalog.persistence.entity.InventoryId;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import jp.kusakari.ec.catalog.persistence.repository.InventoryRepository;
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

  private final ProductRepository products;
  private final InventoryRepository inventory;
  private final CatalogService catalog;
  private final ProductMapper mapper;
  private final EntityManager entityManager;

  public ProductView create(ProductRequest input) {
    catalog.requireStore(input.storeId());
    ProductEntity product = mapper.toEntity(input);
    product.setId(UUID.randomUUID().toString());
    if (products.existsBySku(product.getSku())) throw duplicateSku();
    saveProduct(product, true);
    catalog
      .storeIds()
      .forEach(storeId ->
        inventory.save(
          new InventoryEntity(new InventoryId(storeId, product.getId()), storeId == input.storeId() ? input.stock() : 0)
        )
      );
    return catalog.product(product.getId(), input.storeId());
  }

  public ProductView update(String id, ProductRequest input) {
    catalog.requireStore(input.storeId());
    ProductEntity product = products
      .findLocked(id)
      .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。"));
    if (!product.isActive()) throw new ApiException(409, "PRODUCT_ARCHIVED", "削除済みの商品は編集できません。");
    if (products.existsBySkuAndIdNot(input.sku(), id)) throw duplicateSku();
    mapper.updateEntity(input, product);
    saveProduct(product, false);

    InventoryEntity stock = inventory
      .findById(new InventoryId(input.storeId(), id))
      .orElseGet(() -> new InventoryEntity(new InventoryId(input.storeId(), id), 0));
    stock.setQuantity(input.stock());
    inventory.save(stock);
    return catalog.product(id, input.storeId());
  }

  public void delete(String id) {
    ProductEntity product = products
      .findLocked(id)
      .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。"));
    product.setActive(false);
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
