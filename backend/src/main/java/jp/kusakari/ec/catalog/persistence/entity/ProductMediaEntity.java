package jp.kusakari.ec.catalog.persistence.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "product_media")
@Getter
@Setter
public class ProductMediaEntity {

  @Id
  @Column(length = 36)
  private String id;

  @Column(name = "content_type", nullable = false, length = 30)
  private String contentType;

  @Lob
  @Column(name = "image_data", nullable = false, columnDefinition = "LONGBLOB")
  private byte[] imageData;
}
