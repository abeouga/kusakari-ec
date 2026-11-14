package jp.kusakari.ec.store.service;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.moderation.dto.ModerationDtos.EventView;
import jp.kusakari.ec.moderation.dto.ModerationDtos.State;
import jp.kusakari.ec.moderation.dto.ModerationDtos.Warning;
import jp.kusakari.ec.moderation.persistence.entity.ModerationAction;
import jp.kusakari.ec.moderation.persistence.entity.StoreModerationEventEntity;
import jp.kusakari.ec.moderation.persistence.repository.StoreModerationEventRepository;
import jp.kusakari.ec.moderation.service.ModerationHistory;
import jp.kusakari.ec.notification.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 運営による店舗の警告・警告解除・利用停止・再開（EC-A11、#16）。
 * どの操作も店舗の行をロックしてから、履歴に1行足し、店舗の出店者（オーナーと担当者）へ通知する。
 * お会計も店舗の行をロックしてから受付を確かめるので、停止の後に注文はできない。
 */
@Service
@RequiredArgsConstructor
@Transactional
public class StoreModerationService {

  private final StoreRepository stores;
  private final StoreModerationEventRepository events;
  private final ModerationHistory history;
  private final AuthService auth;
  private final NotificationService notices;

  /** 利用停止・再開。停止は理由が必須。すでにその状態なら何もしない。閉鎖済みの店舗は変えられない。 */
  public State enable(long id, boolean enabled, String reason) {
    auth.requireAdmin();
    StoreEntity store = lock(id);
    ModerationAction action = enabled ? ModerationAction.RESUME : ModerationAction.SUSPEND;
    String trimmed = ModerationHistory.reasonFor(action, reason);
    if (store.isSuspended() == enabled) {
      store.changeSuspended(!enabled);
      record(store, action, trimmed, enabled ? "店舗の利用停止が解除されました" : "店舗の利用が停止されました");
    }
    return state(store);
  }

  /** 警告・警告解除。警告中の店舗にもう一度警告できる。利用の状態は変えない。 */
  public State warn(long id, boolean warned, String reason) {
    auth.requireAdmin();
    StoreEntity store = lock(id);
    ModerationAction action = warned ? ModerationAction.WARN : ModerationAction.CLEAR_WARNING;
    String trimmed = ModerationHistory.reasonFor(action, reason);
    if (warned || currentWarning(id) != null) {
      record(store, action, trimmed, warned ? "店舗に運営から警告がありました" : "店舗への運営の警告が解除されました");
    }
    return state(store);
  }

  @Transactional(readOnly = true)
  public List<EventView> events(long id) {
    auth.requireAdmin();
    if (!stores.existsById(id)) throw notFound();
    return history.views(events.findByStoreIdOrderByIdDesc(id));
  }

  /** 店舗の一覧（出店者・運営）に出す、警告中の店舗とその警告。権限は呼ぶ側で確かめている。 */
  @Transactional(readOnly = true)
  public Map<Long, Warning> warnings(Collection<Long> storeIds) {
    if (storeIds.isEmpty()) return Map.of();
    return ModerationHistory.activeWarnings(
      events.findByStoreIdInAndEventTypeInOrderByIdDesc(storeIds, ModerationHistory.WARNING_TYPES),
      StoreModerationEventEntity::getStoreId
    );
  }

  private void record(StoreEntity store, ModerationAction action, String reason, String title) {
    events.save(new StoreModerationEventEntity(store.getId(), action, reason, auth.current().getId()));
    notices.toStore(store.getId(), title, ModerationHistory.noticeBody(store.getName(), reason));
  }

  private Warning currentWarning(long id) {
    return ModerationHistory.activeWarning(events.findByStoreIdOrderByIdDesc(id));
  }

  private State state(StoreEntity store) {
    events.flush();
    return new State(store.isSuspended(), currentWarning(store.getId()));
  }

  private StoreEntity lock(long id) {
    StoreEntity store = stores.lock(id).orElseThrow(StoreModerationService::notFound);
    if (store.getClosedAt() != null) throw new ApiException(409, "STORE_CLOSED", "この店舗は閉鎖済みです。");
    return store;
  }

  private static ApiException notFound() {
    return new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。");
  }
}
