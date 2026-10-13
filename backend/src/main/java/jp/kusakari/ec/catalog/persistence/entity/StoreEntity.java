package jp.kusakari.ec.catalog.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "stores")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StoreEntity {

  @Id
  private Long id;

  @Column(nullable = false, length = 100)
  private String name;

  @Column(nullable = false, length = 200)
  private String address;

  @Column(nullable = false)
  private double latitude;

  @Column(nullable = false)
  private double longitude;

  @Column(nullable = false, length = 80)
  private String hours;
}
