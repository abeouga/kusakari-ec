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

  /** オーナーの譲渡で、承認を待っている譲渡先（#194 の 10）。申し出がなければ空。 */
  @Column(name = "pending_owner_member_id", length = 36, columnDefinition = "CHAR(36)")
  private String pendingOwnerMemberId;

  /** 承認の期限（申し出た時刻＋30 分、#194 の 12）。譲渡先と一緒に空になる（DB の CHECK）。 */
  @Column(name = "pending_owner_expires_at")
  private Instant pendingOwnerExpiresAt;

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

  /** 承認待ちの譲渡の申し出があり、期限が過ぎていない。期限が過ぎた申し出は残っていないものとして扱う（#194 の 16）。 */
  public boolean hasPendingOwnerSuccession(Instant now) {
    return pendingOwnerMemberId != null && pendingOwnerExpiresAt.isAfter(now);
  }

  /** 承認待ちの列に、期限が過ぎた申し出が残っている（#194 の 15）。 */
  public boolean hasExpiredOwnerSuccession(Instant now) {
    return pendingOwnerMemberId != null && !pendingOwnerExpiresAt.isAfter(now);
  }

  /** 譲渡を申し出る。期限は申し出た時刻＋30 分（#194 の 12）。 */
  public void requestOwnerSuccession(String memberId, Instant expiresAt) {
    this.pendingOwnerMemberId = memberId;
    this.pendingOwnerExpiresAt = expiresAt;
  }

  /** 譲渡の承認で、オーナーを付け替える（#197 の 8）。新しいオーナーの種別を先に SHOP_OWNER にしておく（複合外部キー）。 */
  public void changeOwner(String memberId) {
    this.ownerMemberId = memberId;
  }

  /** 承認待ちを空に戻す（承認・断り・取り消し・自動で無効）。 */
  public void clearOwnerSuccession() {
    this.pendingOwnerMemberId = null;
    this.pendingOwnerExpiresAt = null;
  }

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
