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
public class StoreMemberId implements java.io.Serializable {

  @Column(name = "store_id")
  private Long storeId;

  @Column(name = "member_id", length = 36, columnDefinition = "CHAR(36)")
  private String memberId;
}
