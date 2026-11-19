package jp.kusakari.ec.notification.persistence.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

@Entity
@Table(name = "notifications")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NotificationEntity {

  public static final String PERSONAL = "PERSONAL";
  public static final String STORE = "STORE";

  // 通知の種類（#194 の 17）。重要かどうかは種類から決め、DB には持たない。
  public static final String ORDER = "ORDER";
  public static final String CANCEL_REQUEST = "CANCEL_REQUEST";
  public static final String MODERATION = "MODERATION";
  public static final String STORE_CLOSURE = "STORE_CLOSURE";
  public static final String OWNER_SUCCESSION_REQUEST = "OWNER_SUCCESSION_REQUEST";
  public static final String OWNER_SUCCESSION_RESULT = "OWNER_SUCCESSION_RESULT";
  public static final String GENERAL = "GENERAL";

  @Id
  @Column(columnDefinition = "CHAR(36)")
  private String id;

  @Column(columnDefinition = "CHAR(36)", nullable = false)
  private String memberId;

  /** PERSONAL（本人あて）か STORE（店舗あて）。店舗に所属していない担当者は本人あてだけを見る（#169）。 */
  @Column(length = 16, nullable = false, updatable = false)
  private String kind = PERSONAL;

  /** 店舗あての通知の店舗。V5 より前の店舗あての通知は空。 */
  @Column(name = "store_id", updatable = false)
  private Long storeId;

  /** 通知の種類。V6 より前の通知は GENERAL。 */
  @Column(length = 32, nullable = false, updatable = false)
  private String category = GENERAL;

  @Column(length = 200, nullable = false)
  private String title;

  @Column(length = 1000, nullable = false)
  private String body;

  @Column(nullable = false)
  private Instant createdAt;

  private Instant readAt;

  public NotificationEntity(String memberId, String title, String body) {
    this.id = java.util.UUID.randomUUID().toString();
    this.memberId = memberId;
    this.title = title;
    this.body = body;
    this.createdAt = Instant.now();
  }

  /** 店舗あての通知。 */
  public static NotificationEntity forStore(String memberId, long storeId, String title, String body) {
    var notice = new NotificationEntity(memberId, title, body);
    notice.kind = STORE;
    notice.storeId = storeId;
    return notice;
  }

  public void markRead() {
    if (readAt == null) readAt = Instant.now();
  }
}
