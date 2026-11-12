package jp.kusakari.ec.store.service;

import jakarta.validation.constraints.*;
import java.io.IOException;
import java.time.Instant;
import java.util.*;
import jp.kusakari.ec.auth.*;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.notification.service.NotificationService;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.entity.StoreApplicationEntity;
import jp.kusakari.ec.store.persistence.repository.StoreApplicationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreApplicationService {

  private final AuthService auth;
  private final AuthMemberRepository members;
  private final jp.kusakari.ec.store.persistence.repository.OrganizationRepository organizations;
  private final StoreApplicationRepository applications;
  private final NotificationService notices;

  public record Input(
    @NotBlank @Size(max = 100) String company,
    @NotBlank @Size(max = 100) String contact,
    @NotBlank @Email @Size(max = 200) String email,
    @NotBlank @Size(max = 200) String address,
    @NotBlank @Pattern(regexp = "[0-9+() -]{1,30}") String phone
  ) {}

  public record Application(
    String id,
    String company,
    String contact,
    String email,
    String address,
    String phone,
    String status,
    String reason,
    Instant createdAt,
    String documentName
  ) {}

  public record Document(String name, String type, byte[] data) {}

  public Application submit(Input in, MultipartFile file) throws IOException {
    var member = members.lockMember(auth.current().getId()).orElseThrow();
    // 出店を申請できるのは、企業様向けの登録で作った法人用アカウントだけ。
    if (!AuthMember.SHOP_OWNER_APPLICANT.equals(member.getAccountType())) throw new ApiException(
      403,
      "APPLICANT_REQUIRED",
      "出店の申請は、企業様向けの登録で作ったアカウントで行ってください。"
    );
    var existing = applications.lockAllForMember(member.getId());
    var latest = existing.stream().filter(StoreApplicationEntity::isLatest).findFirst().orElse(null);
    if (latest != null && StoreApplicationEntity.SUBMITTED.equals(latest.getStatus())) throw new ApiException(
      409,
      "APPLICATION_EXISTS",
      "審査中の申請があります。"
    );
    if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024) throw new ApiException(
      400,
      "INVALID_DOCUMENT",
      "確認書類は5MB以内で指定してください。"
    );
    byte[] bytes = file.getBytes();
    String type;
    if (bytes.length > 5 && new String(bytes, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-")) type =
      "application/pdf";
    else if (bytes.length > 8 && bytes[0] == (byte) 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71) type =
      "image/png";
    else if (bytes.length > 3 && bytes[0] == (byte) 255 && bytes[1] == (byte) 216 && bytes[2] == (byte) 255) type =
      "image/jpeg";
    else throw new ApiException(400, "INVALID_DOCUMENT", "PDF・PNG・JPEGを指定してください。");
    String name = Objects.toString(file.getOriginalFilename(), "document")
      .replace('\\', '_')
      .replace('/', '_')
      .replace('\r', '_')
      .replace('\n', '_');
    var a = new StoreApplicationEntity(
      member.getId(),
      in.company(),
      in.contact(),
      in.email(),
      in.address(),
      in.phone(),
      name.substring(0, Math.min(200, name.length())),
      type,
      bytes
    );
    // 再申請：前々回の申請を消し、今の申請を「前回の申請」にしてから、新しい申請を作る。
    // 「今の申請」と「前回の申請」はそれぞれ1行までなので、この順で行い、そのつど DB に反映する。
    if (latest != null) {
      existing.stream().filter(previous -> !previous.isLatest()).forEach(applications::delete);
      applications.flush();
      latest.becomePrevious();
      applications.flush();
    }
    applications.save(a);
    notices.send(member.getId(), "出店申請を受け付けました", a.getCompany());
    return view(a);
  }

  @Transactional(readOnly = true)
  public List<Application> list(boolean operator) {
    if (operator) auth.requireAdmin();
    return (operator
        ? applications.findAllByOrderByCreatedAtDesc()
        : applications.findByMemberIdOrderByCreatedAtDesc(auth.current().getId()))
      .stream()
      .map(this::view)
      .toList();
  }

  public Application decide(String id, boolean approved, String reason) {
    auth.requireAdmin();
    var a = applications.lock(id).orElseThrow(this::missing);
    if (!a.getStatus().equals(StoreApplicationEntity.SUBMITTED)) throw new ApiException(
      409,
      "APPLICATION_CHANGED",
      "この申請は審査済みです。"
    );
    var m = members.lockMember(a.getMemberId()).orElseThrow();
    if (approved) {
      if (!m.isEnabled() || !AuthMember.SHOP_OWNER_APPLICANT.equals(m.getAccountType())) throw new ApiException(
        409,
        "MEMBER_CHANGED",
        "申請者の利用状態が変わりました。"
      );
      // 承認では組織だけを作る。店舗は、オーナーが承認の後に作る。
      // 組織のオーナーは種別が SHOP_OWNER の会員に限られるので、先に種別を変えて DB に反映する。
      m.becomeOwner();
      members.flush();
      var organization = organizations.saveAndFlush(new OrganizationEntity(a.getCompany(), m.getId()));
      a.approve(organization.getId());
    } else {
      if (reason.isBlank()) throw new ApiException(400, "REASON_REQUIRED", "却下理由が必要です。");
      a.reject(reason);
    }
    notices.send(
      m.getId(),
      approved ? "出店申請が承認されました" : "出店申請が却下されました",
      a.getCompany() + " / " + reason
    );
    return view(a);
  }

  /** 審査中の申請を取り下げる。取り下げた申請は残り、同じ内容を直して再申請できる。 */
  public Application withdraw(String id) {
    var a = applications.lock(id).orElseThrow(this::missing);
    if (!a.getMemberId().equals(auth.current().getId())) throw missing();
    if (!a.isLatest() || !a.getStatus().equals(StoreApplicationEntity.SUBMITTED)) throw new ApiException(
      409,
      "APPLICATION_CHANGED",
      "この申請は取り下げできません。"
    );
    a.withdraw();
    return view(a);
  }

  @Transactional(readOnly = true)
  public Document document(String id) {
    var a = applications.findById(id).orElseThrow(this::missing);
    var m = auth.current();
    if (!m.isAdmin() && !m.getId().equals(a.getMemberId())) throw missing();
    return new Document(a.getDocumentName(), a.getDocumentType(), a.getDocumentData());
  }

  private Application view(StoreApplicationEntity a) {
    return new Application(
      a.getId(),
      a.getCompany(),
      a.getContact(),
      a.getEmail(),
      a.getAddress(),
      a.getPhone(),
      a.getStatus(),
      a.getReason(),
      a.getCreatedAt(),
      a.getDocumentName()
    );
  }

  private ApiException missing() {
    return new ApiException(404, "APPLICATION_NOT_FOUND", "申請が見つかりません。");
  }
}
