package jp.kusakari.ec.catalog.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "stores")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StoreEntity {

  @Column(length = 100, nullable = false)
  private String company = "";

  @Column(length = 100, nullable = false)
  private String contact = "";

  @Column(length = 200, nullable = false)
  private String email = "";

  @Column(length = 1000, nullable = false)
  private String story = "";

  @Column(nullable = false)
  private boolean enabled = true;

  @jakarta.persistence.Version
  private long revision;

  public static StoreEntity create(String name, String address) {
    StoreEntity store = new StoreEntity();
    store.name = name;
    store.address = address;
    store.hours = "未設定";
    return store;
  }

  public void updateProfile(
    String name,
    String company,
    String contact,
    String email,
    String address,
    String hours,
    String story
  ) {
    this.name = name.trim();
    this.company = company.trim();
    this.contact = contact.trim();
    this.email = email;
    this.address = address.trim();
    this.hours = hours.trim();
    this.story = story.trim();
  }

  public void changeEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  @Id
  @jakarta.persistence.GeneratedValue(strategy = jakarta.persistence.GenerationType.IDENTITY)
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
