package jp.kusakari.ec.payment.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stripe の通知（Webhook）を処理する。署名は呼ぶ前に確かめている。
 * 通知の ID を stripe_events に記録し、同じ通知の2回目は何もしない（在庫・通知・返金を二重にしない）。
 * 処理が失敗したら記録ごと取り消し、Stripe の再送で処理し直す。
 */
@Service
@RequiredArgsConstructor
public class StripeWebhookService {

  private final JdbcTemplate jdbc;
  private final PaymentService payments;
  private final RefundService refunds;

  /** @return 今回処理したら true、処理済みの通知なら false */
  @Transactional
  public boolean handle(JsonNode event) {
    String id = event.path("id").asText("");
    String type = event.path("type").asText("");
    if (!id.startsWith("evt_") || id.length() > 255 || type.isEmpty() || type.length() > 100) {
      throw new IllegalArgumentException("Unexpected event.");
    }
    // 同時に同じ通知が届いても、主キーの重複で片方だけが処理する。
    if (jdbc.update("INSERT IGNORE INTO stripe_events (event_id, event_type) VALUES (?, ?)", id, type) == 0) {
      return false;
    }
    JsonNode object = event.path("data").path("object");
    switch (type) {
      case "payment_intent.succeeded" -> payments.succeeded(object);
      case "payment_intent.payment_failed" -> payments.failed(object);
      case "refund.created", "refund.updated", "refund.failed" -> refunds.apply(object);
      // Charge の refunds は API のバージョンによって含まれない。含まれていれば反映する。
      case "charge.refunded" -> object.path("refunds").path("data").forEach(refunds::apply);
      // charge.dispute.created（チャージバック）などは、stripe_events に記録するだけ。
      default -> {}
    }
    return true;
  }
}
