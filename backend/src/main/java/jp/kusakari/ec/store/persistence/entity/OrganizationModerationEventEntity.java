package jp.kusakari.ec.store.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 組織の受付停止・停止・取り消し（再開）の履歴（#109）。行は書き換えず、足していく。 */
@Entity
@Table(name = "organization_moderation_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrganizationModerationEventEntity {

  public static final String STOP_ACCEPTING = "STOP_ACCEPTING";
  public static final String SUSPEND = "SUSPEND";
  public static final String RESUME = "RESUME";

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "organization_id", nullable = false, updatable = false)
  private Long organizationId;

  @Column(name = "event_type", nullable = false, length = 16, updatable = false)
  private String eventType;

  @Column(nullable = false, length = 1000, updatable = false)
  private String reason;

  /** 操作した運営。未完了の注文がなくなって自動で停止になったときは空。 */
  @Column(name = "actor_member_id", length = 36, columnDefinition = "CHAR(36)", updatable = false)
  private String actorMemberId;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt = Instant.now();

  public OrganizationModerationEventEntity(long organizationId, String eventType, String reason, String actorMemberId) {
    this.organizationId = organizationId;
    this.eventType = eventType;
    this.reason = reason.trim();
    this.actorMemberId = actorMemberId;
  }
}
