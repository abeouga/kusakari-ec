package jp.kusakari.ec.auth;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

@Entity
@Table(name = "members", uniqueConstraints = @UniqueConstraint(columnNames = { "issuer", "subject" }))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuthMember {

  /** 購入者。 */
  public static final String USER = "USER";
  /** 申請中の法人用アカウント。承認されると SHOP_OWNER になる。 */
  public static final String SHOP_OWNER_APPLICANT = "SHOP_OWNER_APPLICANT";
  /** 組織のオーナー。 */
  public static final String SHOP_OWNER = "SHOP_OWNER";
  /** 子アカウント。店舗ごとのロールは store_members が持つ。 */
  public static final String SHOP_STAFF = "SHOP_STAFF";
  /** 運営。 */
  public static final String ADMIN = "ADMIN";

  private Instant withdrawnAt;

  @Id
  @Column(length = 36, columnDefinition = "CHAR(36)")
  private String id;

  @Column(nullable = false, length = 255)
  private String issuer;

  @Column(nullable = false, length = 255)
  private String subject;

  @Column(nullable = false, length = 255)
  private String email;

  @Column(name = "display_name", nullable = false, length = 120)
  private String displayName;

  @Column(name = "account_type", nullable = false, length = 32)
  private String accountType = USER;

  @Column(nullable = false)
  private boolean enabled = true;

  /** メール確認が済んだ日時。企業様向けの登録では、登録の時点で会員を作るので、確認までは空。 */
  @Column(name = "email_verified_at")
  private Instant emailVerifiedAt;

  @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
  private Instant createdAt;

  public void withdraw() {
    enabled = false;
    withdrawnAt = Instant.now();
  }

  public void changeEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  /** 出店申請の承認。組織を作る前に呼ぶ（組織の外部キーが、オーナーの種別を SHOP_OWNER に限るため）。 */
  public void becomeOwner() {
    this.accountType = SHOP_OWNER;
  }

  public void markEmailVerified() {
    if (emailVerifiedAt == null) emailVerifiedAt = Instant.now();
  }

  public boolean isAdmin() {
    return ADMIN.equals(accountType);
  }

  public AuthMember(String issuer, String subject, String email, String name, String accountType) {
    this.id = java.util.UUID.randomUUID().toString();
    this.issuer = issuer;
    this.subject = subject;
    this.email = email;
    this.displayName = name;
    this.accountType = accountType;
  }
}
