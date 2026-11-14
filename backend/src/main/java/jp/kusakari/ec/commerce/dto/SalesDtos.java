package jp.kusakari.ec.commerce.dto;

import java.time.Instant;
import java.util.List;

/** 注文実績と販売手数料（#130）。手数料は表示だけで、請求・精算・Stripe での差し引きはしない。 */
public final class SalesDtos {

  private SalesDtos() {}

  /**
   * 注文1件の手数料。commissionRateBp と保存した手数料は注文したときの値（率の設定を変えても変わらない）。
   * キャンセルの注文は commissionYen・netYen を 0 として返す（保存した額は残す）。
   * counted は合計に含めるか（キャンセルと支払い待ちは含めない）。
   */
  public record SalesFigures(int commissionRateBp, int commissionYen, int netYen, boolean counted) {}

  /** 注文1件を1行。エクスポートを作るときは、この一覧をそのまま出す。 */
  public record SalesRow(
    String orderId,
    String createdAt,
    String status,
    String cancellationStatus,
    String paymentMethod,
    int totalYen,
    int commissionRateBp,
    int commissionYen,
    int netYen,
    boolean counted
  ) {}

  /** orderCount・各金額は counted の注文だけ。cancellationPendingCount はキャンセル申請中の受付済みの注文。 */
  public record SalesTotals(
    int orderCount,
    int pendingPaymentCount,
    int cancelledCount,
    int cancellationPendingCount,
    long totalYen,
    long commissionYen,
    long netYen
  ) {}

  /** closedAt があれば閉鎖済みの店舗で、画面は読み取り専用と表示する。 */
  public record SalesReport(
    long storeId,
    String storeName,
    Instant closedAt,
    List<SalesRow> orders,
    SalesTotals totals
  ) {}

  /** 注文実績を見られる店舗。閉鎖済みの店舗は closedAt を持つ。 */
  public record SalesStore(long id, String name, Instant closedAt) {}
}
