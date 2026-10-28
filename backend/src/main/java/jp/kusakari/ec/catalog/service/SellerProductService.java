package jp.kusakari.ec.catalog.service;

import java.util.List;
import java.util.HashSet;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.dto.ProductImageReference;
import jp.kusakari.ec.catalog.dto.ProductStatusRequest;
import jp.kusakari.ec.catalog.dto.StockUpdateRequest;
import jp.kusakari.ec.catalog.persistence.repository.InventoryRepository;
import jp.kusakari.ec.catalog.persistence.repository.ProductRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class SellerProductService {
  private final CatalogService catalog;
  private final jp.kusakari.ec.catalog.mapper.ProductMapper mapper;
  private final InventoryRepository inventory;
  private final ProductRepository products;
  private final jp.kusakari.ec.auth.AuthService auth;

  @Transactional(readOnly = true)
  public List<ProductView> list(long storeId) {
    auth.requireSeller(storeId);
    return catalog.allProducts(storeId).stream()
      .filter(p -> !p.publicationStatus().equals("DELETED")).map(mapper::toSellerView).toList();
  }

  public void update(ProductStatusRequest request) {
    auth.requireSeller(request.storeId());
    catalog.requireStore(request.storeId());
    if (new HashSet<>(request.productIds()).size() != request.productIds().size()) {
      throw new ApiException(400, "DUPLICATE_PRODUCT", "商品IDが重複しています。");
    }
    // Lock in the same order as checkout. Validate the whole batch before changing anything.
    var rows = request.productIds().stream().sorted().map(id ->
      inventory.lockAtStore(request.storeId(), id).orElseThrow(() ->
        new ApiException(404, "PRODUCT_NOT_FOUND", "選択店舗の商品が見つかりません。"))).toList();
    var found = products.findByIdIn(request.productIds());
    if (found.size() != rows.size() || found.stream().anyMatch(p -> !p.isActive()) ||
        rows.stream().anyMatch(row -> row.getPublicationStatus().equals("DELETED") && !request.status().equals("DELETED"))) {
      throw new ApiException(409, "PRODUCT_ARCHIVED", "削除済みの商品は再公開・非表示に変更できません。");
    }
    rows.forEach(row -> row.setPublicationStatus(request.status()));
  }

  /**
   * EC-S05: changes only this store's stock. The row is locked like checkout and cancellation restock,
   * and the update is rejected when the quantity the seller saw is no longer current (5b).
   */
  public ProductView updateStock(String id, StockUpdateRequest request) {
    auth.requireSeller(request.storeId());
    catalog.requireStore(request.storeId());
    var row = inventory.lockAtStore(request.storeId(), id).orElseThrow(() ->
      new ApiException(404, "PRODUCT_NOT_FOUND", "選択店舗の商品が見つかりません。"));
    boolean active = products.findImageReferences(List.of(id)).stream().anyMatch(ProductImageReference::active);
    if (!active || row.getPublicationStatus().equals("DELETED")) {
      throw new ApiException(409, "PRODUCT_ARCHIVED", "削除済みの商品の在庫は変更できません。");
    }
    if (row.getQuantity() != request.expectedStock()) throw stockChanged(row.getQuantity());
    row.setQuantity(request.stock());
    return mapper.toSellerView(catalog.product(id, request.storeId()));
  }

  static ApiException stockChanged(int current) {
    return new ApiException(
      409,
      "STOCK_CHANGED",
      "在庫数が変更されています（現在の在庫数：" + current + "）。最新の在庫数を確認して、もう一度保存してください。"
    );
  }
}
