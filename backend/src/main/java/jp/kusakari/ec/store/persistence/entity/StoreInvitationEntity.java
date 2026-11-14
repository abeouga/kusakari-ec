package jp.kusakari.ec.store.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 店舗の招待キー。キーそのものは保存せず、SHA-256 のハッシュだけを持つ（#111）。 */
@Entity
@Table(name = "store_invitations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StoreInvitationEntity {

  @Id
  @Column(length = 36, columnDefinition = "CHAR(36)")
  private String id;

  @Column(name = "store_id", nullable = false, updatable = false)
  private Long storeId;

  @Column(name = "issued_by_member_id", nullable = false, updatable = false, length = 36, columnDefinition = "CHAR(36)")
  private String issuedByMemberId;

  @Column(name = "key_hash", nullable = false, updatable = false, length = 64, columnDefinition = "CHAR(64)")
  private String keyHash;

  @Column(name = "expires_at", nullable = false, updatable = false)
  private Instant expiresAt;

  /** 1 = 1回限り、空 = 有効期限内なら何回でも。 */
  @Column(name = "max_uses", updatable = false)
  private Integer maxUses;

  @Column(name = "revoked_at")
  private Instant revokedAt;

  @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
  private Instant createdAt;

  public StoreInvitationEntity(long storeId, String issuedBy, String keyHash, Instant expiresAt, Integer maxUses) {
    this.id = UUID.randomUUID().toString();
    this.storeId = storeId;
    this.issuedByMemberId = issuedBy;
    this.keyHash = keyHash;
    this.expiresAt = expiresAt;
    this.maxUses = maxUses;
  }

  public void revoke() {
    if (revokedAt == null) revokedAt = Instant.now();
  }

  /** 取り消し・期限切れでなく、使った人数が上限に達していないか。上限は、キーの行をロックしてから確かめる。 */
  public boolean usable(Instant now, long uses) {
    return revokedAt == null && expiresAt.isAfter(now) && (maxUses == null || uses < maxUses);
  }
}
