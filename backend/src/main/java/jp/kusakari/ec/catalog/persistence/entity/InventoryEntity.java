package jp.kusakari.ec.catalog.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 在庫と、出店者による公開状態。商品と1対1。大きな 3D モデルの JSON を持つ商品とは、ロックの対象を分けている。 */
@Entity
@Table(name = "inventory")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InventoryEntity {

  public static final String PUBLISHED = "PUBLISHED";
  public static final String HIDDEN = "HIDDEN";
  public static final String DELETED = "DELETED";

  @Id
  @Column(name = "product_id", length = 40)
  @Setter(AccessLevel.NONE)
  private String productId;

  @Column(nullable = false)
  private int quantity;

  @Column(name = "publication_status", nullable = false, length = 16)
  private String publicationStatus = PUBLISHED;

  public InventoryEntity(String productId, int quantity) {
    this.productId = productId;
    this.quantity = quantity;
  }
}
