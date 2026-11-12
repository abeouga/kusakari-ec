package jp.kusakari.ec.commerce.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "carts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CartEntity {

  @Id
  @Column(length = 36, columnDefinition = "CHAR(36)")
  private String id;

  /** カートは会員ごとに1つ。未ログインではカートを使えない。 */
  @Column(name = "member_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
  private String memberId;

  @Column(nullable = false)
  private long revision;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt = Instant.now();

  public CartEntity(String id) {
    this.id = id;
  }

  public void incrementRevision() {
    revision++;
  }
}
