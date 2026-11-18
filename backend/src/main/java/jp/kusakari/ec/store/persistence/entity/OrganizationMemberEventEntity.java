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

/**
 * 担当者の操作の記録（#170・#178）。行は書き換えず、足していく。
 * 店舗の担当にする・外す記録には店舗を入れ、除名と復帰の記録では空にする（#177）。
 */
@Entity
@Table(name = "organization_member_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrganizationMemberEventEntity {

  public static final String ASSIGN_TO_STORE = "ASSIGN_TO_STORE";
  public static final String REMOVE_FROM_STORE = "REMOVE_FROM_STORE";
  public static final String EXPEL_FROM_ORGANIZATION = "EXPEL_FROM_ORGANIZATION";
  public static final String REINSTATE_TO_ORGANIZATION = "REINSTATE_TO_ORGANIZATION";

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "organization_id", nullable = false, updatable = false)
  private Long organizationId;

  @Column(name = "event_type", nullable = false, length = 32, updatable = false)
  private String eventType;

  @Column(name = "actor_member_id", nullable = false, length = 36, columnDefinition = "CHAR(36)", updatable = false)
  private String actorMemberId;

  @Column(name = "target_member_id", nullable = false, length = 36, columnDefinition = "CHAR(36)", updatable = false)
  private String targetMemberId;

  @Column(name = "store_id", updatable = false)
  private Long storeId;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt = Instant.now();

  private OrganizationMemberEventEntity(
    long organizationId,
    String eventType,
    String actorMemberId,
    String targetMemberId,
    Long storeId
  ) {
    this.organizationId = organizationId;
    this.eventType = eventType;
    this.actorMemberId = actorMemberId;
    this.targetMemberId = targetMemberId;
    this.storeId = storeId;
  }

  /** 店舗の担当にした・外した記録。 */
  public static OrganizationMemberEventEntity ofStore(
    long organizationId,
    String eventType,
    String actorMemberId,
    String targetMemberId,
    long storeId
  ) {
    if (!ASSIGN_TO_STORE.equals(eventType) && !REMOVE_FROM_STORE.equals(eventType)) {
      throw new IllegalArgumentException("Not a store event: " + eventType);
    }
    return new OrganizationMemberEventEntity(organizationId, eventType, actorMemberId, targetMemberId, storeId);
  }

  /** 組織から除名した・復帰させた記録。 */
  public static OrganizationMemberEventEntity ofOrganization(
    long organizationId,
    String eventType,
    String actorMemberId,
    String targetMemberId
  ) {
    if (!EXPEL_FROM_ORGANIZATION.equals(eventType) && !REINSTATE_TO_ORGANIZATION.equals(eventType)) {
      throw new IllegalArgumentException("Not an organization event: " + eventType);
    }
    return new OrganizationMemberEventEntity(organizationId, eventType, actorMemberId, targetMemberId, null);
  }
}
