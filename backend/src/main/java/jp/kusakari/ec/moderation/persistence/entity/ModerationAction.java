package jp.kusakari.ec.moderation.persistence.entity;

/**
 * 運営が商品・店舗に行う操作（#16）。商品と店舗で共通。
 * WARN と SUSPEND は理由が必須（DB の CHECK も同じ）。CLEAR_WARNING と RESUME の理由は任意。
 */
public enum ModerationAction {
  WARN,
  CLEAR_WARNING,
  SUSPEND,
  RESUME;

  public boolean requiresReason() {
    return this == WARN || this == SUSPEND;
  }
}
