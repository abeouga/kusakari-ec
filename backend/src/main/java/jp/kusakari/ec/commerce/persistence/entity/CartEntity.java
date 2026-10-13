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

  @Column(name = "store_id", nullable = false)
  private long storeId = 1;

  @Column(nullable = false)
  private long revision;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt = Instant.now();

  public CartEntity(String id) {
    this.id = id;
  }

  public void selectStore(long storeId) {
    this.storeId = storeId;
    revision++;
  }

  public void incrementRevision() {
    revision++;
  }
}
