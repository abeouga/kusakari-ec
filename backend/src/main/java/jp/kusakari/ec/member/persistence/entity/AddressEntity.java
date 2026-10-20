package jp.kusakari.ec.member.persistence.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "member_addresses")
@Getter
@AllArgsConstructor
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AddressEntity {

  @Id
  @Column(columnDefinition = "CHAR(36)")
  private String memberId;

  @Column(length = 100, nullable = false)
  private String recipient;

  @Column(length = 8, nullable = false)
  private String postal;

  @Column(length = 200, nullable = false)
  private String address;
}
