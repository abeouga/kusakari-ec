package jp.kusakari.ec.moderation.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 運営による商品の警告・警告解除・停止・再開の履歴（#16）。行は書き換えず、削除もしない。 */
@Entity
@Table(name = "product_moderation_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProductModerationEventEntity implements ModerationEvent {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "product_id", nullable = false, length = 40, updatable = false)
  private String productId;

  @Enumerated(EnumType.STRING)
  @Column(name = "event_type", nullable = false, length = 16, updatable = false)
  private ModerationAction eventType;

  @Column(nullable = false, length = 1000, updatable = false)
  private String reason;

  @Column(name = "actor_member_id", nullable = false, length = 36, columnDefinition = "CHAR(36)", updatable = false)
  private String actorMemberId;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt = Instant.now();

  public ProductModerationEventEntity(String productId, ModerationAction eventType, String reason, String actorMemberId) {
    this.productId = productId;
    this.eventType = eventType;
    this.reason = reason;
    this.actorMemberId = actorMemberId;
  }
}
