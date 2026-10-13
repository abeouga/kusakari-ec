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
@Table(name = "order_details")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderDetailsEntity {

  @Id
  @Column(name = "order_id", length = 36, columnDefinition = "CHAR(36)")
  private String orderId;

  @Embedded
  private DeliveryFields details = new DeliveryFields();

  public OrderDetailsEntity(String orderId, DeliveryFields details) {
    this.orderId = orderId;
    this.details = details;
  }
}
