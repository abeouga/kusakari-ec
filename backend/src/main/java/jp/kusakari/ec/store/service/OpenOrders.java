package jp.kusakari.ec.store.service;

import java.util.Collection;
import java.util.List;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
import jp.kusakari.ec.commerce.persistence.repository.OrderRepository;
import jp.kusakari.ec.commerce.service.StockReturn;
import jp.kusakari.ec.notification.service.NotificationService;
import jp.kusakari.ec.payment.service.RefundService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 店舗の閉鎖（#79）と組織の停止（#109）で共通の、未完了の注文の判定と、運営のまとめてキャンセル。
 * 閉鎖・停止を止める注文は、支払い待ち・注文受付・受取準備完了（キャンセル申請の対応待ちは注文受付にしか起きない）。
 */
@Component
@RequiredArgsConstructor
public class OpenOrders {

  /** 閉鎖・停止を止める状態。支払い待ちは30分以内に注文受付か取り消しになるので、それまで待つ。 */
  static final List<String> BLOCKING = List.of("PENDING_PAYMENT", "ACCEPTED", "READY");

  /** 運営がまとめてキャンセルする状態。支払い待ちは同じお会計のほかの店舗の注文と決済を共有するので、ここでは取り消さない。 */
  static final List<String> CANCELLABLE = List.of("ACCEPTED", "READY");

  static final String CANCELLED_TITLE = "この注文は出店者からキャンセルされました";

  private final OrderRepository orders;
  private final StockReturn stock;
  private final RefundService refunds;
  private final NotificationService notices;

  public long count(Collection<Long> storeIds) {
    return storeIds.isEmpty() ? 0 : orders.countByStatus(storeIds, BLOCKING);
  }

  /** 未完了の注文がある購入者に知らせる（閉鎖予定・受付停止）。受け取りに来てもらうため。 */
  public void notifyBuyers(Collection<Long> storeIds, String title, String body) {
    if (storeIds.isEmpty()) return;
    orders.findBuyersByStatus(storeIds, BLOCKING).forEach(buyer -> notices.send(buyer, title, body));
  }

  /**
   * 未完了の注文をまとめてキャンセルし、在庫を戻し、カードで支払い済みなら返金し、購入者と店舗に知らせる。
   * 呼ぶ側は店舗か組織の行をロックしてから呼ぶ。注文は ID の順にロックし、在庫は商品 ID の順（StockReturn）。
   * @return キャンセルした件数
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public int cancelAll(Collection<Long> storeIds, String operatorMemberId, String reason) {
    if (storeIds.isEmpty()) return 0;
    List<OrderEntity> targets = orders.lockByStatus(storeIds, CANCELLABLE);
    if (targets.isEmpty()) return 0;
    stock.restock(targets.stream().map(OrderEntity::getId).toList());
    for (OrderEntity order : targets) {
      order.cancelByOperator(operatorMemberId, reason);
      // カードで支払い済みの注文だけ返金する（店頭払いは何もしない）。結果は Webhook で反映する。
      refunds.refundCancelledOrder(order, operatorMemberId);
      String body = order.getId() + " / " + order.getStoreName() + " " + reason.trim();
      notices.send(order.getBuyerMemberId(), CANCELLED_TITLE, body);
      notices.toStore(order.getStoreId(), "運営が注文をキャンセルしました", body);
    }
    return targets.size();
  }
}
