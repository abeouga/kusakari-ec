package jp.kusakari.ec.notification.persistence.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

@Entity
@Table(name = "notifications")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NotificationEntity {

  @Id
  @Column(columnDefinition = "CHAR(36)")
  private String id;

  @Column(columnDefinition = "CHAR(36)", nullable = false)
  private String memberId;

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

  public void markRead() {
    if (readAt == null) readAt = Instant.now();
  }
}
