package jp.kusakari.ec.catalog.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Embeddable
@Data
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class InventoryId {

  @Column(name = "store_id")
  private Long storeId;

  @Column(name = "product_id", length = 40)
  private String productId;
}
