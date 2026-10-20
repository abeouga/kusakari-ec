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

  public CategoryEntity(String name) {
    this.name = name;
  }
}
