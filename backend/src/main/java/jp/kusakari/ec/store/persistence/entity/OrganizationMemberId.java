package jp.kusakari.ec.store.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Embeddable
@Data
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class OrganizationMemberId implements java.io.Serializable {

  @Column(name = "organization_id")
  private Long organizationId;

  @Column(name = "member_id", length = 36, columnDefinition = "CHAR(36)")
  private String memberId;
}
