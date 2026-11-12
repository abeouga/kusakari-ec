package jp.kusakari.ec.store.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 出店申請。申請の対象は組織で、1人につき「今の申請」と「前回の申請」の2行まで持つ。 */
@Entity
@Table(name = "organization_applications")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StoreApplicationEntity {

  public static final String SUBMITTED = "SUBMITTED";
  public static final String APPROVED = "APPROVED";
  public static final String REJECTED = "REJECTED";
  public static final String WITHDRAWN = "WITHDRAWN";

  @Id
  @Column(columnDefinition = "CHAR(36)")
  private String id;

  @Column(name = "applicant_member_id", columnDefinition = "CHAR(36)", nullable = false)
  private String memberId;

  @Column(length = 20, nullable = false)
  private String status = SUBMITTED;

  /** true は今の申請、false は前回の申請。DB の一意キーが、それぞれ1行までに限る。 */
  @Column(name = "is_latest", nullable = false)
  private boolean latest = true;

  @Column(name = "organization_name", length = 160, nullable = false)
  private String company;

  @Column(name = "contact_name", length = 120, nullable = false)
  private String contact;

  @Column(name = "contact_email", length = 255, nullable = false)
  private String email;

  @Column(name = "contact_phone", length = 40, nullable = false)
  private String phone;

  @Column(name = "company_address", length = 255, nullable = false)
  private String address;

  @Column(name = "rejection_reason", length = 1000)
  private String reason;

  @Column(name = "document_name", length = 255)
  private String documentName;

  @Column(name = "document_type", length = 100)
  private String documentType;

  @Lob
  @Column(name = "document_data", columnDefinition = "LONGBLOB")
  private byte[] documentData;

  /** 承認で作った組織。承認済みの申請にだけ入る（DB の CHECK 制約）。 */
  @Column(name = "organization_id")
  private Long organizationId;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  @Column(name = "submitted_at")
  private Instant submittedAt = Instant.now();

  @Column(name = "reviewed_at")
  private Instant reviewedAt;

  public StoreApplicationEntity(
    String memberId,
    String company,
    String contact,
    String email,
    String address,
    String phone,
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
    this.documentName = documentName;
    this.documentType = documentType;
    this.documentData = documentData;
  }

  public void approve(long organizationId) {
    status = APPROVED;
    this.organizationId = organizationId;
    reason = "";
    reviewedAt = Instant.now();
  }

  public void reject(String reason) {
    status = REJECTED;
    this.reason = reason.trim();
    reviewedAt = Instant.now();
  }

  public void withdraw() {
    status = WITHDRAWN;
  }

  /** 再申請のときに、今の申請を「前回の申請」にする。却下・取り下げ済みの申請だけが前回になれる。 */
  public void becomePrevious() {
    latest = false;
  }

  public String getReason() {
    return reason == null ? "" : reason;
  }
}
