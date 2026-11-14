package jp.kusakari.ec.store.service;

import java.util.List;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.notification.service.NotificationService;
import jp.kusakari.ec.store.persistence.repository.StoreMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 店舗の閉鎖（#79）。閉鎖を始めると閉鎖中になり、新しい注文を受け付けない。未完了の注文がなくなった時点で自動で閉鎖済みにする。
 * オーナーと運営が始められる。閉鎖中はオーナーが取り消せるが、運営が始めた閉鎖は運営だけが取り消せる。閉鎖済みは戻せない。
 * 運営は、閉鎖中の店舗の未完了の注文をまとめてキャンセル（返金・在庫の戻し・通知）できる。
 */
@Service
@RequiredArgsConstructor
@Transactional
public class StoreClosureService {

  private final StoreRepository stores;
  private final StoreMemberRepository storeMembers;
  private final AuthService auth;
  private final OpenOrders openOrders;
  private final NotificationService notices;

  /** 閉鎖を始める。未完了の注文がなければ、その場で閉鎖済みになる。 */
  public void start(long storeId) {
    StoreEntity store = lock(storeId);
    String by = actorFor(store);
    if (store.getClosedAt() != null) throw closed();
    if (store.getClosingStartedAt() != null) throw new ApiException(409, "STORE_CLOSING", "この店舗はすでに閉鎖中です。");
    store.startClosing(by);
    notices.toStore(storeId, "店舗の閉鎖を始めました", store.getName() + "：新しい注文の受付を止めました。");
    openOrders.notifyBuyers(
      List.of(storeId),
      "ご注文の店舗は閉鎖予定です",
      store.getName() + "は閉鎖予定です。ご注文の商品はお早めにお受け取りください。"
    );
    settle(store);
  }

  /** 閉鎖中を取り消して営業に戻す。 */
  public void cancel(long storeId) {
    StoreEntity store = lock(storeId);
    String by = actorFor(store);
    if (store.getClosedAt() != null) throw closed();
    if (store.getClosingStartedAt() == null) throw new ApiException(409, "STORE_NOT_CLOSING", "この店舗は閉鎖中ではありません。");
    if (StoreEntity.CLOSED_BY_OWNER.equals(by) && StoreEntity.CLOSED_BY_ADMIN.equals(store.getClosingStartedBy())) {
      throw new ApiException(403, "CLOSED_BY_OPERATOR", "運営が始めた閉鎖は、運営だけが取り消せます。");
    }
    store.cancelClosing();
    notices.toStore(storeId, "店舗の閉鎖を取り消しました", store.getName() + "：新しい注文の受付を再開しました。");
  }

  /** 運営が、閉鎖中の店舗の未完了の注文をまとめてキャンセルする。そのあと注文が残っていなければ閉鎖済みになる。 */
  public int cancelOrders(long storeId, String reason) {
    auth.requireAdmin();
    StoreEntity store = lock(storeId);
    if (!store.isClosing()) throw new ApiException(
      409,
      "STORE_NOT_CLOSING",
      "まとめてキャンセルできるのは、閉鎖中の店舗だけです。"
    );
    int cancelled = openOrders.cancelAll(List.of(storeId), auth.current().getId(), reason);
    settle(store);
    return cancelled;
  }

  /** 定期処理と、注文の状態が変わった後に呼ぶ。閉鎖中で未完了の注文がなければ閉鎖済みにする。 */
  public void settle(long storeId) {
    stores.lock(storeId).ifPresent(this::settle);
  }

  private void settle(StoreEntity store) {
    if (!store.isClosing() || openOrders.count(List.of(store.getId())) > 0) return;
    store.completeClosing();
    notices.toStore(store.getId(), "店舗の閉鎖が完了しました", store.getName() + "：閉鎖済みになりました。");
    // 担当（店長・スタッフ）は組織に残し、この店舗の割り当てだけ外す（#79 決定事項8）。
    storeMembers.deleteAllAtStore(store.getId());
  }

  /** 運営なら ADMIN、その店舗の組織のオーナーなら OWNER。それ以外は拒否する。 */
  private String actorFor(StoreEntity store) {
    AuthMember member = auth.current();
    if (member.isAdmin()) return StoreEntity.CLOSED_BY_ADMIN;
    auth.requireOwnerOf(store);
    return StoreEntity.CLOSED_BY_OWNER;
  }

  private StoreEntity lock(long storeId) {
    return stores.lock(storeId).orElseThrow(() -> new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。"));
  }

  private static ApiException closed() {
    return new ApiException(409, "STORE_CLOSED", "この店舗は閉鎖済みです。再開はできません。");
  }
}
