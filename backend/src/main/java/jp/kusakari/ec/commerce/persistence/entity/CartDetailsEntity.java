package jp.kusakari.ec.commerce.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "cart_details")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CartDetailsEntity {

  @Id
  @Column(name = "cart_id", length = 36, columnDefinition = "CHAR(36)")
  private String cartId;

  @Embedded
  private DeliveryFields details = new DeliveryFields();

  public CartDetailsEntity(String cartId, DeliveryFields details) {
    this.cartId = cartId;
    this.details = details;
  }
}
