package jp.kusakari.ec.moderation.dto;

import jakarta.validation.constraints.Size;
import java.time.Instant;

/** 商品と店舗で共通の、運営の警告・停止の Request/Response（#16）。 */
public final class ModerationDtos {

  private ModerationDtos() {}

  /** 今出ている警告（最新の警告の理由と日時）。警告していない・解除した対象は null。 */
  public record Warning(String reason, Instant createdAt) {}

  /** 履歴の1行。type は WARN・CLEAR_WARNING・SUSPEND・RESUME。actorName は操作した運営者の表示名。 */
  public record EventView(String type, String reason, String actorName, Instant createdAt) {}

  /** 操作の後の状態。suspended は運営が停止しているか。 */
  public record State(boolean suspended, Warning warning) {}

  /** 警告する（warned=true、理由は必須）・警告を解除する（warned=false、理由は任意）。 */
  public record WarningRequest(boolean warned, @Size(max = 500) String reason) {}

  /** 出店者の商品一覧に出す、運営の警告・停止（警告中か停止中の商品だけ）。 */
  public record ProductNotice(String productId, String productName, boolean suspended, Warning warning) {}
}
