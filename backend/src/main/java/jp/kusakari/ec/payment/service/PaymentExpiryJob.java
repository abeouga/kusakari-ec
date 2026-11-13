package jp.kusakari.ec.payment.service;

import java.time.Duration;
import java.time.Instant;
import jp.kusakari.ec.payment.persistence.repository.PaymentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 支払われなかったカードの注文を、時間切れで取り消して在庫を戻す（1分ごと）。
 * 支払い失敗の Webhook が届かない場合（画面を閉じた、カードを入力しなかった）も、在庫を押さえ続けない。
 */
@Component
@EnableScheduling
public class PaymentExpiryJob {

  private static final Logger log = LoggerFactory.getLogger(PaymentExpiryJob.class);

  private final PaymentRepository payments;
  private final PaymentService service;
  private final Duration timeout;

  public PaymentExpiryJob(
    PaymentRepository payments,
    PaymentService service,
    @Value("${kusakari.ec.payment-timeout-minutes:30}") long timeoutMinutes
  ) {
    if (timeoutMinutes < 1) throw new IllegalArgumentException("kusakari.ec.payment-timeout-minutes must be 1 or more.");
    this.payments = payments;
    this.service = service;
    this.timeout = Duration.ofMinutes(timeoutMinutes);
  }

  @Scheduled(fixedDelayString = "${kusakari.ec.payment-expiry-interval-ms:60000}", initialDelay = 10000)
  public void expireUnpaid() {
    for (String paymentId : payments.findPendingBefore(Instant.now().minus(timeout))) {
      try {
        service.expire(paymentId);
      } catch (RuntimeException error) {
        // 1件の失敗で残りを止めない。次の回にもう一度試す。
        log.warn("Unpaid payment {} could not be expired ({}).", paymentId, error.getClass().getSimpleName());
      }
    }
  }
}
