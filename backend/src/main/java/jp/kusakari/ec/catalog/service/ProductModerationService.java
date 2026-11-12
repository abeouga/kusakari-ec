package jp.kusakari.ec.catalog.service;

import static java.util.stream.Collectors.toMap;

import java.util.*;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.*;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.notification.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ProductModerationService {

  private final AuthService auth;
  private final ProductRepository products;
  private final InventoryRepository inventory;
  private final StoreRepository stores;
  private final NotificationService notices;

  /** active は、出店者が削除していない商品。 */
  public record Product(String id, String name, Long storeId, String storeName, boolean active, boolean suspended) {}

  @Transactional(readOnly = true)
  public List<Product> list() {
    auth.requireAdmin();
    Map<Long, String> storeNames = stores.findAll().stream().collect(toMap(StoreEntity::getId, StoreEntity::getName));
    Map<String, String> statuses = inventory
      .findAll()
      .stream()
      .collect(toMap(InventoryEntity::getProductId, InventoryEntity::getPublicationStatus));
    return products
      .findAll()
      .stream()
      .map(p ->
        new Product(
          p.getId(),
          p.getName(),
          p.getStoreId(),
          storeNames.getOrDefault(p.getStoreId(), ""),
          !InventoryEntity.DELETED.equals(statuses.getOrDefault(p.getId(), InventoryEntity.DELETED)),
          p.isSuspended()
        )
      )
      .toList();
  }

  public void suspend(String id, boolean suspended, String reason) {
    auth.requireAdmin();
    var p = products
      .findLocked(id)
      .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。"));
    if (p.isSuspended() == suspended) return;
    p.moderate(suspended);
    notices.toStore(
      p.getStoreId(),
      suspended ? "商品の公開を停止しました" : "商品の公開停止を解除しました",
      p.getName() + " / " + reason
    );
  }
}
