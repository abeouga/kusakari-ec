package jp.kusakari.ec.catalog.service;

import static java.util.stream.Collectors.toMap;

import java.util.*;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.dto.ProductImageReference;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.*;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.moderation.dto.ModerationDtos.EventView;
import jp.kusakari.ec.moderation.dto.ModerationDtos.ProductNotice;
import jp.kusakari.ec.moderation.dto.ModerationDtos.State;
import jp.kusakari.ec.moderation.dto.ModerationDtos.Warning;
import jp.kusakari.ec.moderation.persistence.entity.ModerationAction;
import jp.kusakari.ec.moderation.persistence.entity.ProductModerationEventEntity;
import jp.kusakari.ec.moderation.persistence.repository.ProductModerationEventRepository;
import jp.kusakari.ec.moderation.service.ModerationHistory;
import jp.kusakari.ec.notification.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 運営による商品の警告・警告解除・公開停止・再開（EC-A10、#16）。
 * どの操作も商品の行をロックしてから、履歴に1行足し、店舗の出店者（オーナーと担当者）へ通知する。
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ProductModerationService {

  private final AuthService auth;
  private final ProductRepository products;
  private final InventoryRepository inventory;
  private final StoreRepository stores;
  private final ProductModerationEventRepository events;
  private final ModerationHistory history;
  private final NotificationService notices;

  /** active は、出店者が削除していない商品。warning は今出ている警告（なければ null）。 */
  public record Product(
    String id,
    String name,
    Long storeId,
    String storeName,
    boolean active,
    boolean suspended,
    Warning warning
  ) {}

  @Transactional(readOnly = true)
  public List<Product> list() {
    auth.requireAdmin();
    Map<Long, String> storeNames = stores.findAll().stream().collect(toMap(StoreEntity::getId, StoreEntity::getName));
    Map<String, String> statuses = inventory
      .findAll()
      .stream()
      .collect(toMap(InventoryEntity::getProductId, InventoryEntity::getPublicationStatus));
    Map<String, Warning> warnings = ModerationHistory.activeWarnings(
      events.findByEventTypeInOrderByIdDesc(ModerationHistory.WARNING_TYPES),
      ProductModerationEventEntity::getProductId
    );
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
          p.isSuspended(),
          warnings.get(p.getId())
        )
      )
      .toList();
  }

  /** 公開停止・再開。停止は理由が必須。すでにその状態なら何もしない（二重送信で履歴と通知を重ねない）。 */
  public State suspend(String id, boolean suspended, String reason) {
    auth.requireAdmin();
    ProductEntity product = lock(id);
    ModerationAction action = suspended ? ModerationAction.SUSPEND : ModerationAction.RESUME;
    String trimmed = ModerationHistory.reasonFor(action, reason);
    if (product.isSuspended() != suspended) {
      product.moderate(suspended);
      record(
        product,
        action,
        trimmed,
        suspended ? "商品の公開を停止しました" : "商品の公開停止を解除しました"
      );
    }
    return state(product);
  }

  /** 警告・警告解除。警告中の商品にもう一度警告できる。警告していない商品の解除は何もしない。公開の状態は変えない。 */
  public State warn(String id, boolean warned, String reason) {
    auth.requireAdmin();
    ProductEntity product = lock(id);
    ModerationAction action = warned ? ModerationAction.WARN : ModerationAction.CLEAR_WARNING;
    String trimmed = ModerationHistory.reasonFor(action, reason);
    if (warned || currentWarning(id) != null) {
      record(product, action, trimmed, warned ? "商品に運営から警告がありました" : "商品への運営の警告が解除されました");
    }
    return state(product);
  }

  @Transactional(readOnly = true)
  public List<EventView> events(String id) {
    auth.requireAdmin();
    if (!products.existsById(id)) throw notFound();
    return history.views(events.findByProductIdOrderByIdDesc(id));
  }

  /** 出店者の商品一覧に出す、警告中か停止中の商品。ロール未割り当ての担当者も所属店舗なら見られる（一覧と同じ）。 */
  @Transactional(readOnly = true)
  public List<ProductNotice> noticesAt(long storeId) {
    auth.requireStoreViewer(storeId);
    Map<String, Warning> warnings = ModerationHistory.activeWarnings(
      events.findAtStore(storeId, ModerationHistory.WARNING_TYPES),
      ProductModerationEventEntity::getProductId
    );
    Set<String> suspended = new HashSet<>(products.findSuspendedIdsAtStore(storeId));
    Set<String> ids = new TreeSet<>(warnings.keySet());
    ids.addAll(suspended);
    if (ids.isEmpty()) return List.of();
    return products
      .findImageReferences(ids)
      .stream()
      .filter(ProductImageReference::active)
      .map(p -> new ProductNotice(p.id(), p.name(), suspended.contains(p.id()), warnings.get(p.id())))
      .sorted(Comparator.comparing(ProductNotice::productId))
      .toList();
  }

  private void record(ProductEntity product, ModerationAction action, String reason, String title) {
    events.save(new ProductModerationEventEntity(product.getId(), action, reason, auth.current().getId()));
    notices.toStore(product.getStoreId(), title, ModerationHistory.noticeBody(product.getName(), reason));
  }

  private Warning currentWarning(String id) {
    return ModerationHistory.activeWarning(events.findByProductIdOrderByIdDesc(id));
  }

  private State state(ProductEntity product) {
    events.flush();
    return new State(product.isSuspended(), currentWarning(product.getId()));
  }

  private ProductEntity lock(String id) {
    return products.findLocked(id).orElseThrow(ProductModerationService::notFound);
  }

  private static ApiException notFound() {
    return new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。");
  }
}
