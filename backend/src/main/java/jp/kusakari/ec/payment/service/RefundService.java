package jp.kusakari.ec.payment.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
import jp.kusakari.ec.commerce.persistence.repository.OrderRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.payment.persistence.entity.PaymentEntity;
import jp.kusakari.ec.payment.persistence.entity.RefundEntity;
import jp.kusakari.ec.payment.persistence.repository.PaymentRepository;
import jp.kusakari.ec.payment.persistence.repository.RefundRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 返金の処理を1か所にまとめる（#133）。キャンセルの承認と、店舗の閉鎖・組織の停止によるまとめてキャンセル（#79・#109）から呼ぶ。
 * 返金の行（REQUESTED）を呼ぶ側のトランザクションで作り、コミットの後で Stripe に返金を頼む。結果は Webhook で反映する。
 */
@Service
public class RefundService {

  private static final Logger log = LoggerFactory.getLogger(RefundService.class);

  private final PaymentRepository payments;
  private final RefundRepository refunds;
  private final OrderRepository orders;
  private final StripeGateway stripe;
  private final TransactionTemplate separate;

  public RefundService(
    PaymentRepository payments,
    RefundRepository refunds,
    OrderRepository orders,
    StripeGateway stripe,
    PlatformTransactionManager transactions
  ) {
    this.payments = payments;
    this.refunds = refunds;
    this.orders = orders;
    this.stripe = stripe;
    this.separate = new TransactionTemplate(transactions);
    this.separate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /**
   * 取り消した注文がカードで支払い済みなら、その注文の金額を返金する（店頭払い・未払いは何もしない）。
   * 注文1件に返金は1行なので、同じ注文を2回返金しない。
   * @param requestedByMemberId 返金を始めた人（キャンセルを承認した人）。自動の返金は null
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public void refundCancelledOrder(OrderEntity order, String requestedByMemberId) {
    if (order.getPaymentId() == null || refunds.findByOrderId(order.getId()).isPresent()) return;
    var payment = payments.findById(order.getPaymentId()).orElseThrow();
    if (!PaymentEntity.SUCCEEDED.equals(payment.getStatus()) || payment.getPaymentIntentId() == null) return;
    var refund = refunds.save(
      new RefundEntity(UUID.randomUUID().toString(), order.getId(), payment.getId(), order.getTotalYen(), requestedByMemberId)
    );
    String refundId = refund.getId();
    String intentId = payment.getPaymentIntentId();
    String orderId = order.getId();
    int amount = order.getTotalYen();
    AfterCommit.run(() -> send(refundId, intentId, orderId, amount));
  }

  private void send(String refundId, String intentId, String orderId, int amountYen) {
    try {
      String stripeRefundId = stripe.createRefund(intentId, amountYen, orderId, refundId);
      separate.executeWithoutResult(status -> refunds.lock(refundId).ifPresent(r -> r.attachStripeRefund(stripeRefundId)));
    } catch (ApiException error) {
      // Stripe に届かなかった返金は失敗として表示する（店舗と運営の注文画面）。
      log.warn("Refund {} was not sent to Stripe.", refundId);
      separate.executeWithoutResult(status ->
        refunds.lock(refundId).ifPresent(r -> {
          if (r.getStripeRefundId() == null) r.changeStatus(RefundEntity.FAILED);
        })
      );
    }
  }

  /** Webhook の Refund（refund.created・refund.updated・refund.failed・charge.refunded の中身）を返金の行に反映する。 */
  @Transactional(propagation = Propagation.MANDATORY)
  public void apply(JsonNode refundObject) {
    String stripeRefundId = refundObject.path("id").asText("");
    if (!stripeRefundId.startsWith("re_") && !stripeRefundId.startsWith("pyr_")) return;
    String status = switch (refundObject.path("status").asText("")) {
      case "succeeded" -> RefundEntity.SUCCEEDED;
      case "failed", "canceled" -> RefundEntity.FAILED;
      default -> null;
    };
    var refund = refunds
      .lockByStripeRefund(stripeRefundId)
      .or(() -> refunds.lock(refundObject.path("metadata").path("refund_id").asText("")))
      .or(() -> importDashboardRefund(refundObject));
    refund.ifPresent(r -> {
      r.attachStripeRefund(stripeRefundId);
      if (status != null) r.changeStatus(status);
    });
  }

  /**
   * Stripe の管理画面から返金されたもの（受け取り後の返品など）は、金額が合う、まだ返金のない注文1件に記録する。
   * 合う注文がなければ記録しない（stripe_events には残る）。注文の状態は変えない。
   */
  private java.util.Optional<RefundEntity> importDashboardRefund(JsonNode refundObject) {
    String intentId = refundObject.path("payment_intent").asText("");
    long amount = refundObject.path("amount").asLong(0);
    if (intentId.isEmpty() || refundObject.path("metadata").has("refund_id")) return java.util.Optional.empty();
    return payments
      .lockByIntent(intentId)
      .flatMap(payment ->
        orders
          .lockByPayment(payment.getId())
          .stream()
          .filter(o -> o.getTotalYen() == amount && refunds.findByOrderId(o.getId()).isEmpty())
          .findFirst()
          .map(o ->
            refunds.save(new RefundEntity(UUID.randomUUID().toString(), o.getId(), payment.getId(), (int) amount, null))
          )
      );
  }
}
