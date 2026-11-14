package jp.kusakari.ec.store.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 店舗の担当。子アカウント（SHOP_STAFF）を、店舗ごとのロールで割り当てる。 */
@Entity
@Table(name = "store_members")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StoreMemberEntity {

  public static final String MANAGER = "MANAGER";
  public static final String STAFF = "STAFF";

  @EmbeddedId
  private StoreMemberId id;

  @Column(name = "organization_id", nullable = false)
  private Long organizationId;

  /** MANAGER か STAFF。空は、招待キーで登録した直後の「ロール未割り当て」。 */
  @Column(length = 16)
  private String role;

  public StoreMemberEntity(long storeId, String memberId, long organizationId, String role) {
    this.id = new StoreMemberId(storeId, memberId);
    this.organizationId = organizationId;
    this.role = role;
  }

  public void changeRole(String role) {
    this.role = role;
  }
}
