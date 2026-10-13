package jp.kusakari.ec.catalog.persistence.entity;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "material_products")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MaterialProductEntity {

  @EmbeddedId
  private MaterialProductId id;
}
