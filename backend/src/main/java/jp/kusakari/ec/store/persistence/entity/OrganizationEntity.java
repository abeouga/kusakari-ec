package jp.kusakari.ec.store.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 組織。出店申請の承認で作る。事業者名の正本はここだけに持つ。 */
@Entity
@Table(name = "organizations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrganizationEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 160)
  private String name;

  /** オーナーの会員。サンプルの組織だけ空。オーナーの種別は、DB の複合外部キーが SHOP_OWNER に限る。 */
  @Column(name = "owner_member_id", length = 36, columnDefinition = "CHAR(36)")
  private String ownerMemberId;

  /** 運営が受付を止めた日時。空なら通常、日時があれば受付停止中か停止。 */
  @Column(name = "suspension_started_at")
  private Instant suspensionStartedAt;

  @Column(nullable = false)
  private boolean suspended;

  public OrganizationEntity(String name, String ownerMemberId) {
    this.name = name.trim();
    this.ownerMemberId = ownerMemberId;
  }

  public static final String ACTIVE = "ACTIVE";
  public static final String NOT_ACCEPTING = "NOT_ACCEPTING";
  public static final String SUSPENDED = "SUSPENDED";

  /** 新しい注文を受け付けられるか。受付停止中と停止のどちらでも受け付けない。 */
  public boolean acceptsOrders() {
    return suspensionStartedAt == null;
  }

  /** 通常（ACTIVE）・受付停止中（NOT_ACCEPTING）・停止（SUSPENDED）。 */
  public String status() {
    if (suspended) return SUSPENDED;
    return suspensionStartedAt == null ? ACTIVE : NOT_ACCEPTING;
  }

  /** 運営が受付を止める（受付停止中）。配下のすべての店舗が新しい注文を受け付けなくなる。 */
  public void stopAccepting() {
    suspensionStartedAt = Instant.now();
    suspended = false;
  }

  /** 受付停止中で未完了の注文がなくなったら、停止にする（店舗も商品も購入者に見えなくなる）。 */
  public void suspend() {
    suspended = true;
  }

  /** 受付停止の取り消し、または停止からの再開。通常に戻す。 */
  public void resume() {
    suspensionStartedAt = null;
    suspended = false;
  }
}
