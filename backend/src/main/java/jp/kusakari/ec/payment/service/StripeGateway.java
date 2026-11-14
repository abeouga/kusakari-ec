package jp.kusakari.ec.payment.service;

import com.stripe.StripeClient;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.net.RequestOptions;
import com.stripe.net.Webhook;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.RefundCreateParams;
import jp.kusakari.ec.common.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Stripe（テストモードだけ）の呼び出し。鍵がない、またはテスト用の鍵でないときは、カード決済を使えなくする（起動は止めない）。
 * 鍵の値はログ・エラー応答に出さない。
 */
@Component
public class StripeGateway {

  private static final Logger log = LoggerFactory.getLogger(StripeGateway.class);
  /** Webhook の署名の時刻のずれを許す秒数（Stripe の既定と同じ5分）。 */
  private static final long SIGNATURE_TOLERANCE_SECONDS = 300;

  private final String webhookSecret;
  private final StripeClient client;

  public record Intent(String id, String clientSecret) {}

  public StripeGateway(
    @Value("${STRIPE_SECRET_KEY:}") String secretKey,
    @Value("${STRIPE_WEBHOOK_SECRET:}") String webhookSecret
  ) {
    // 秘密鍵は sk_test_（標準のキー）か rk_test_（制限付きキー）。本番の鍵（sk_live_・rk_live_）は使わない。
    boolean testKey = secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_");
    boolean signing = webhookSecret.startsWith("whsec_");
    this.webhookSecret = signing ? webhookSecret : "";
    this.client = testKey && signing ? new StripeClient(secretKey) : null;
    if (client == null) {
      log.info(
        "Stripe card payments are disabled (test secret key: {}, webhook signing secret: {}).",
        testKey ? "set" : "missing",
        signing ? "set" : "missing"
      );
    }
  }

  public boolean enabled() {
    return client != null;
  }

  /** お会計1回に PaymentIntent を1つ作る。同じ requestId の再送では、Stripe が同じ PaymentIntent を返す。 */
  public Intent createIntent(String paymentId, String requestId, int amountYen) {
    var params = PaymentIntentCreateParams.builder()
      .setAmount((long) amountYen)
      .setCurrency("jpy")
      .setCaptureMethod(PaymentIntentCreateParams.CaptureMethod.AUTOMATIC)
      .setAutomaticPaymentMethods(
        PaymentIntentCreateParams.AutomaticPaymentMethods.builder()
          .setEnabled(true)
          .setAllowRedirects(PaymentIntentCreateParams.AutomaticPaymentMethods.AllowRedirects.NEVER)
          .build()
      )
      .putMetadata("payment_id", paymentId)
      .build();
    try {
      var intent = stripe().v1().paymentIntents().create(params, idempotent(requestId));
      return new Intent(intent.getId(), intent.getClientSecret());
    } catch (StripeException error) {
      throw unavailable("create a payment intent", error);
    }
  }

  public Intent retrieveIntent(String intentId) {
    try {
      var intent = stripe().v1().paymentIntents().retrieve(intentId);
      return new Intent(intent.getId(), intent.getClientSecret());
    } catch (StripeException error) {
      throw unavailable("retrieve a payment intent", error);
    }
  }

  /** 取り消した注文の PaymentIntent を、もう支払えないようにする。すでに成功・取り消し済みなら何もしない。 */
  public void cancelIntent(String intentId) {
    if (client == null) return;
    try {
      client.v1().paymentIntents().cancel(intentId);
    } catch (StripeException error) {
      log.warn("Stripe payment intent was not cancelled ({}, {}).", error.getClass().getSimpleName(), error.getCode());
    }
  }

  /** 注文1件の金額を返金する。Idempotency-Key は注文ごとに1つなので、同じ注文を2回返金しない。 */
  public String createRefund(String intentId, int amountYen, String orderId, String refundId) {
    var params = RefundCreateParams.builder()
      .setPaymentIntent(intentId)
      .setAmount((long) amountYen)
      .putMetadata("refund_id", refundId)
      .putMetadata("order_id", orderId)
      .build();
    try {
      return stripe().v1().refunds().create(params, idempotent("refund-" + orderId)).getId();
    } catch (StripeException error) {
      throw unavailable("create a refund", error);
    }
  }

  /** Stripe の署名を、届いたままの本文で確かめる。 */
  public boolean signatureValid(String payload, String header) {
    if (webhookSecret.isEmpty() || header == null || header.isBlank()) return false;
    try {
      return Webhook.Signature.verifyHeader(payload, header, webhookSecret, SIGNATURE_TOLERANCE_SECONDS);
    } catch (SignatureVerificationException error) {
      return false;
    }
  }

  private StripeClient stripe() {
    if (client == null) throw new ApiException(
      409,
      "CARD_PAYMENT_UNAVAILABLE",
      "カード決済は現在使えません。店頭払いを選んでください。"
    );
    return client;
  }

  private static RequestOptions idempotent(String key) {
    return RequestOptions.builder().setIdempotencyKey(key).build();
  }

  private static ApiException unavailable(String action, StripeException error) {
    log.warn("Stripe could not {} ({}, {}).", action, error.getClass().getSimpleName(), error.getCode());
    return new ApiException(502, "PAYMENT_PROVIDER_ERROR", "カード決済の処理に失敗しました。時間をおいてもう一度お試しください。");
  }
}
