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
public class MaterialProductId {

  @Column(name = "material_code", length = 80)
  private String materialCode;

  @Column(name = "product_id", length = 40)
  private String productId;
}
