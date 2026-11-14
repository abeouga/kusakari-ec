package jp.kusakari.ec.catalog.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "stores")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StoreEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  /** 店舗が属する組織。作った後は変えない。 */
  @Column(name = "organization_id", nullable = false, updatable = false)
  private Long organizationId;

  @Column(nullable = false, length = 120)
  private String name;

  @Column(nullable = false, length = 255)
  private String address = "";

  /** 位置がない店舗は、緯度と経度の両方が空。 */
  private Double latitude;

  private Double longitude;

  @Column(name = "business_hours", nullable = false, length = 255)
  private String hours = "";

  @Column(name = "contact_name", nullable = false, length = 120)
  private String contact = "";

  @Column(name = "contact_email", nullable = false, length = 255)
  private String email = "";

  @Column(name = "introduction", nullable = false, length = 2000)
  private String story = "";

  /** オーナーによる公開。作った直後は非公開。 */
  @Column(nullable = false)
  private boolean published;

  /** 運営による停止。 */
  @Column(nullable = false)
  private boolean suspended;

  /** 閉鎖を始めた日時。空なら営業中、日時があれば閉鎖中（閉鎖済みを含む）。 */
  @Column(name = "closing_started_at")
  private Instant closingStartedAt;

  /** 閉鎖を始めた人（OWNER か ADMIN）。運営が始めた閉鎖は、運営だけが取り消せる。 */
  @Column(name = "closing_started_by", length = 16)
  private String closingStartedBy;

  /** 閉鎖が済んだ日時。空でなければ閉鎖済みで、購入者には見せない。再開できない。 */
  @Column(name = "closed_at")
  private Instant closedAt;

  @Version
  private long revision;

  public static StoreEntity create(
    long organizationId,
    String name,
    String contact,
    String email,
    String address,
    String hours,
    String story
  ) {
    StoreEntity store = new StoreEntity();
    store.organizationId = organizationId;
    store.updateProfile(name, contact, email, address, hours, story);
    return store;
  }

  public void updateProfile(String name, String contact, String email, String address, String hours, String story) {
    this.name = name.trim();
    this.contact = contact.trim();
    this.email = email;
    this.address = address.trim();
    this.hours = hours.trim();
    this.story = story.trim();
  }

  public void changePublished(boolean published) {
    this.published = published;
  }

  public void changeSuspended(boolean suspended) {
    this.suspended = suspended;
  }

  public static final String CLOSED_BY_OWNER = "OWNER";
  public static final String CLOSED_BY_ADMIN = "ADMIN";

  /** 閉鎖を始める（閉鎖中）。新しい注文を受け付けなくなる。 */
  public void startClosing(String by) {
    closingStartedAt = Instant.now();
    closingStartedBy = by;
  }

  /** 閉鎖中を取り消して営業に戻す。閉鎖済みは戻せない（呼ぶ側が確かめる）。 */
  public void cancelClosing() {
    closingStartedAt = null;
    closingStartedBy = null;
  }

  /** 未完了の注文がなくなった閉鎖中の店舗を、閉鎖済みにする。 */
  public void completeClosing() {
    closedAt = Instant.now();
  }

  public boolean isClosing() {
    return closingStartedAt != null && closedAt == null;
  }

  /** 購入者に見せて、新しい注文を受け付けられる店舗か（組織の停止は別に確かめる）。 */
  public boolean isOpen() {
    return published && !suspended && closingStartedAt == null;
  }

  public boolean hasLocation() {
    return latitude != null && longitude != null;
  }
}
