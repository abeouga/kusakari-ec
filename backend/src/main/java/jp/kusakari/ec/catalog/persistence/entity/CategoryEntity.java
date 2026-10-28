package jp.kusakari.ec.catalog.persistence.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

@Entity
@Table(name = "categories")
@Getter
@Setter
@NoArgsConstructor
public class CategoryEntity {

  @Id
  @Column(length = 30)
  private String name;

  /** Set when the category was deleted while deleted products still reference it (V13). */
  @Column(name = "deleted_at")
  private Instant deletedAt;

  public CategoryEntity(String name) {
    this.name = name;
  }

  public boolean isAvailable() {
    return deletedAt == null;
  }
}
