package jp.kusakari.ec.store.persistence.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

@Entity
@Table(name = "store_applications")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StoreApplicationEntity {

  @Id
  @Column(columnDefinition = "CHAR(36)")
  private String id;

  @Column(columnDefinition = "CHAR(36)", nullable = false)
  private String memberId;

  @Column(length = 100, nullable = false)
  private String company;

  @Column(length = 100, nullable = false)
  private String contact;

  @Column(length = 200, nullable = false)
  private String email;

  @Column(length = 200, nullable = false)
  private String address;

  @Column(length = 30, nullable = false)
  private String phone;

  @Column(length = 30, nullable = false)
  private String plan;

  @Column(length = 20, nullable = false)
  private String status = "PENDING";

  @Column(length = 500, nullable = false)
  private String reason = "";

  @Column(nullable = false)
  private Instant createdAt = Instant.now();

  private Instant reviewedAt;

  @Column(length = 200, nullable = false)
  private String documentName;

  @Column(length = 100, nullable = false)
  private String documentType;

  @Lob
  @Column(nullable = false, columnDefinition = "LONGBLOB")
  private byte[] documentData;

  public StoreApplicationEntity(
    String memberId,
    String company,
    String contact,
    String email,
    String address,
    String phone,
    String plan,
    String documentName,
    String documentType,
    byte[] documentData
  ) {
    this.id = java.util.UUID.randomUUID().toString();
    this.memberId = memberId;
    this.company = company.trim();
    this.contact = contact.trim();
    this.email = email;
    this.address = address.trim();
    this.phone = phone;
    this.plan = plan;
    this.documentName = documentName;
    this.documentType = documentType;
    this.documentData = documentData;
  }

  public void review(boolean approved, String reason) {
    status = approved ? "APPROVED" : "REJECTED";
    this.reason = reason.trim();
    reviewedAt = Instant.now();
  }
}
