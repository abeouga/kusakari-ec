package jp.kusakari.ec.payment.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Optional;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CardPayment;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CheckoutResult;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
import jp.kusakari.ec.commerce.persistence.repository.OrderRepository;
import jp.kusakari.ec.commerce.service.StockReturn;
import jp.kusakari.ec.notification.service.NotificationService;
import jp.kusakari.ec.payment.persistence.entity.PaymentEntity;
import jp.kusakari.ec.payment.persistence.repository.PaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * カード決済（#132）。お会計で作った支払い待ちの注文を、Stripe の通知（Webhook）で確定または取り消す。
 * ロックの順は、決済 → 注文（注文 ID の順）→ 在庫（商品 ID の昇順）。
 */
@Service
public class PaymentService {

  private final PaymentRepository payments;
  private final OrderRepository orders;
  private final StockReturn stock;
  private final NotificationService notices;
  private final RefundService refunds;
  private final StripeGateway stripe;
  private final TransactionTemplate separate;

  public PaymentService(
    PaymentRepository payments,
    OrderRepository orders,
    StockReturn stock,
    NotificationService notices,
    RefundService refunds,
    StripeGateway stripe,
    PlatformTransactionManager transactions
  ) {
    this.payments = payments;
    this.orders = orders;
    this.stock = stock;
    this.notices = notices;
    this.refunds = refunds;
    this.stripe = stripe;
    this.separate = new TransactionTemplate(transactions);
    this.separate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /**
   * お会計のトランザクションがコミットされた後に呼ぶ。決済に PaymentIntent がなければ作り（Idempotency-Key は requestId）、
   * 支払い待ちなら client_secret を返す。Stripe を呼ぶ間は DB のロックを持たない。
   */
  public CheckoutResult start(CheckoutResult result) {
    if (result.payment() == null) return result;
    var payment = payments.findById(result.payment().id()).orElseThrow();
    if (!payment.isPending()) return withPayment(result, payment, null);
    StripeGateway.Intent intent;
    if (payment.getPaymentIntentId() == null) {
      intent = stripe.createIntent(payment.getId(), payment.getRequestId(), payment.getAmountYen());
      separate.executeWithoutResult(status -> payments.lock(payment.getId()).ifPresent(p -> p.attachIntent(intent.id())));
    } else {
      intent = stripe.retrieveIntent(payment.getPaymentIntentId());
    }
    return withPayment(result, payment, intent.clientSecret());
  }

  private static CheckoutResult withPayment(CheckoutResult result, PaymentEntity payment, String clientSecret) {
    return new CheckoutResult(
      result.orders(),
      new CardPayment(payment.getId(), payment.getStatus(), payment.getAmountYen(), clientSecret)
    );
  }

  /** payment_intent.succeeded：決済を成功にし、支払い待ちの注文を受け付けて、購入者と店舗に知らせる。 */
  @Transactional(propagation = Propagation.MANDATORY)
  public void succeeded(JsonNode intent) {
    var found = lockFor(intent);
    if (found.isEmpty()) return;
    var payment = found.get();
    if (PaymentEntity.SUCCEEDED.equals(payment.getStatus())) return;
    boolean late = !payment.isPending();
    payment.succeed();
    for (OrderEntity order : orders.lockByPayment(payment.getId())) {
      if (late) {
        // 時間切れ・失敗で取り消した後に支払いが届いた。注文は取り消したままにして、全額を返金する。
        refunds.refundCancelledOrder(order, null);
        continue;
      }
      order.acceptPayment();
      notices.send(order.getBuyerMemberId(), "ご注文を受け付けました", order.getId() + " / " + order.getStoreName());
      notices.toStore(order.getStoreId(), "新しい注文が届きました", order.getId());
    }
    if (late) notices.send(
      payment.getBuyerMemberId(),
      "お支払いを返金します",
      "取り消し済みの注文へのお支払いを確認したため、全額を返金します。"
    );
  }

  /** payment_intent.payment_failed：支払い待ちの注文を取り消して在庫を戻す。 */
  @Transactional(propagation = Propagation.MANDATORY)
  public void failed(JsonNode intent) {
    lockFor(intent).ifPresent(payment -> cancelUnpaid(payment, PaymentEntity.FAILED));
  }

  /** 時間切れ（定期処理）。まだ支払い待ちなら取り消す。 */
  @Transactional
  public void expire(String paymentId) {
    payments.lock(paymentId).ifPresent(payment -> cancelUnpaid(payment, PaymentEntity.EXPIRED));
  }

  private void cancelUnpaid(PaymentEntity payment, String status) {
    if (!payment.isPending()) return;
    payment.close(status);
    var unpaid = orders.lockByPayment(payment.getId());
    stock.restock(unpaid.stream().map(OrderEntity::getId).toList());
    unpaid.forEach(OrderEntity::cancelUnpaid);
    notices.send(
      payment.getBuyerMemberId(),
      "ご注文を取り消しました",
      (PaymentEntity.EXPIRED.equals(status) ? "お支払いの期限が過ぎたため" : "お支払いができなかったため") +
        "、注文を取り消しました。"
    );
    // 取り消した注文に、後から支払えないようにする。
    String intentId = payment.getPaymentIntentId();
    if (intentId != null) AfterCommit.run(() -> stripe.cancelIntent(intentId));
  }

  private Optional<PaymentEntity> lockFor(JsonNode intent) {
    String intentId = intent.path("id").asText("");
    String paymentId = intent.path("metadata").path("payment_id").asText("");
    // PaymentIntent の ID を保存する前に通知が届いたときは、作るときに付けた決済の ID で探す。
    var payment = payments
      .lockByIntent(intentId)
      .or(() -> payments.lock(paymentId).filter(p -> p.getPaymentIntentId() == null));
    payment.ifPresent(p -> p.attachIntent(intentId));
    return payment;
  }
}
