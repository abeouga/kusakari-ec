package jp.kusakari.ec.member.service;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;
import jp.kusakari.ec.auth.*;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.member.persistence.entity.AddressEntity;
import jp.kusakari.ec.member.persistence.repository.AddressRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class MemberService {

  private final AuthService auth;
  private final AuthMemberRepository members;
  private final AddressRepository addresses;

  public record Address(
    @NotBlank @Size(max = 100) String recipient,
    @NotNull @Pattern(regexp = "[0-9]{3}-?[0-9]{4}") String postal,
    @NotBlank @Size(max = 200) String address
  ) {}

  public record Member(
    String id,
    String name,
    String email,
    String role,
    Long storeId,
    boolean enabled,
    Instant withdrawnAt
  ) {}

  @Transactional(readOnly = true)
  public Address address() {
    return addresses
      .findById(auth.current().getId())
      .map(a -> new Address(a.getRecipient(), a.getPostal(), a.getAddress()))
      .orElse(new Address("", "", ""));
  }

  public Address save(Address input) {
    var a = new AddressEntity(auth.current().getId(), input.recipient().trim(), input.postal(), input.address().trim());
    addresses.save(a);
    return input;
  }

  public void deleteAddress() {
    addresses.deleteById(auth.current().getId());
  }

  public void withdraw() {
    var id = auth.current().getId();
    var m = members.lockMember(id).orElseThrow();
    if (m.getRole().equals("ADMIN")) throw new ApiException(
      409,
      "ADMIN_REQUIRED",
      "管理者はこの画面から退会できません。"
    );
    m.withdraw();
  }

  @Transactional(readOnly = true)
  public List<Member> list() {
    auth.requireAdmin();
    return members
      .findAll()
      .stream()
      .map(m ->
        new Member(
          m.getId(),
          m.getDisplayName(),
          m.getEmail(),
          m.getRole(),
          m.getStoreId(),
          m.isEnabled(),
          m.getWithdrawnAt()
        )
      )
      .toList();
  }

  public void enable(String id, boolean enabled) {
    auth.requireAdmin();
    var m = members
      .lockMember(id)
      .orElseThrow(() -> new ApiException(404, "MEMBER_NOT_FOUND", "会員が見つかりません。"));
    if (m.getRole().equals("ADMIN") || m.getWithdrawnAt() != null) throw new ApiException(
      409,
      "MEMBER_FIXED",
      "管理者または退会済み会員の状態は変更できません。"
    );
    m.changeEnabled(enabled);
  }
}
