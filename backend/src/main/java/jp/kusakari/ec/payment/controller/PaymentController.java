package jp.kusakari.ec.payment.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.payment.service.StripeGateway;
import jp.kusakari.ec.payment.service.StripeWebhookService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PaymentController {

  /** Stripe の通知の本文の上限。通常は数 KB。 */
  private static final int MAX_EVENT_BYTES = 512 * 1024;

  private final StripeGateway stripe;
  private final StripeWebhookService webhooks;
  private final ObjectMapper json;

  /** 画面がカードの選択肢を出すか決める。テスト用の鍵がなければ false（店頭払いだけ）。 */
  @GetMapping("/api/payments/config")
  public Map<String, Boolean> config() {
    return Map.of("cardAvailable", stripe.enabled());
  }

  /** 会員認証なし・CSRF の対象外。届いたままの本文で Stripe の署名を確かめ、不正なら何もせず 400。 */
  @PostMapping("/api/payments/stripe/webhook")
  public Map<String, Object> webhook(HttpServletRequest request) throws IOException {
    byte[] body = request.getInputStream().readNBytes(MAX_EVENT_BYTES + 1);
    if (body.length > MAX_EVENT_BYTES) throw invalid();
    String payload = new String(body, StandardCharsets.UTF_8);
    if (!stripe.signatureValid(payload, request.getHeader("Stripe-Signature"))) throw invalid();
    try {
      JsonNode event = json.readTree(payload);
      return Map.of("received", true, "processed", webhooks.handle(event));
    } catch (IOException | IllegalArgumentException error) {
      throw invalid();
    }
  }

  private static ApiException invalid() {
    return new ApiException(400, "INVALID_WEBHOOK", "通知を確認できませんでした。");
  }
}
