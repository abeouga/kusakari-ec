package jp.kusakari.ec.moderation.persistence.entity;

import java.time.Instant;

/** 商品・店舗の履歴の行に共通する項目。履歴の表示と「警告中か」の判定を、商品と店舗で同じ処理にするために使う。 */
public interface ModerationEvent {
  Long getId();

  ModerationAction getEventType();

  String getReason();

  String getActorMemberId();

  Instant getCreatedAt();
}
