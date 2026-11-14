package jp.kusakari.ec.store.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 組織への所属。担当者（SHOP_STAFF）だけが入る。オーナーは organizations.owner_member_id で結び付く。 */
@Entity
@Table(name = "organization_members")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrganizationMemberEntity {

  public static final String ORG_ADMIN = "ORG_ADMIN";

  @EmbeddedId
  private OrganizationMemberId id;

  /** 外部キーが、所属できる会員を SHOP_STAFF に限るための列。 */
  @Column(name = "member_account_type", nullable = false, length = 32)
  private String memberAccountType = "SHOP_STAFF";

  /** 人事のロール。ORG_ADMIN か空（ロールなし）。 */
  @Column(length = 16)
  private String role;

  public OrganizationMemberEntity(long organizationId, String memberId) {
    this.id = new OrganizationMemberId(organizationId, memberId);
  }

  public boolean isOrganizationAdmin() {
    return ORG_ADMIN.equals(role);
  }

  public void changeRole(String role) {
    this.role = role;
  }
}
