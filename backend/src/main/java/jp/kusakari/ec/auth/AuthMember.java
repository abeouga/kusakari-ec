package jp.kusakari.ec.auth;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "auth_members", uniqueConstraints = @UniqueConstraint(columnNames = { "issuer", "subject" }))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuthMember {

  @Id
  @Column(length = 36, columnDefinition = "CHAR(36)")
  private String id;

  @Column(nullable = false, length = 250)
  private String issuer;

  @Column(nullable = false, length = 128)
  private String subject;

  @Column(nullable = false, length = 250)
  private String email;

  @Column(name = "display_name", nullable = false, length = 100)
  private String displayName;

  @Column(nullable = false, length = 10)
  private String role = "USER";

  @Column(name = "store_id")
  private Long storeId;

  @Column(nullable = false)
  private boolean enabled = true;

  public AuthMember(String issuer, String subject, String email, String name) {
    this.id = java.util.UUID.randomUUID().toString();
    this.issuer = issuer;
    this.subject = subject;
    this.email = email;
    this.displayName = name;
  }
}
