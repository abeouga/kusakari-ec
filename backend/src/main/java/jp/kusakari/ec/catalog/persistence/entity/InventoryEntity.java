package jp.kusakari.ec.catalog.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "inventory")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InventoryEntity {

  @EmbeddedId
  private InventoryId id;

  @Column(nullable = false)
  private int quantity;

  public InventoryEntity(InventoryId id, int quantity) {
    this.id = id;
    this.quantity = quantity;
  }
}
