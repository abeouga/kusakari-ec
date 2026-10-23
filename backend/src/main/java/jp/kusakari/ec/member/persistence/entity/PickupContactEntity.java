package jp.kusakari.ec.member.persistence.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "member_pickup_contacts")
@Getter
@AllArgsConstructor
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PickupContactEntity {

  @Id
  @Column(columnDefinition = "CHAR(36)")
  private String memberId;

  @Column(length = 100, nullable = false)
  private String recipientName;

  @Column(length = 30, nullable = false)
  private String recipientPhone;

  @Column(length = 200, nullable = false)
  private String contactEmail;
}
