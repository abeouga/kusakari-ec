package jp.kusakari.ec.member.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;
import jp.kusakari.ec.auth.*;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.member.persistence.entity.PickupContactEntity;
import jp.kusakari.ec.member.persistence.repository.PickupContactRepository;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.service.PendingOwnerSuccession;
import jp.kusakari.ec.store.service.PendingOwnerSuccession.Reason;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class MemberService {

  private final AuthService auth;
  private final AuthMemberRepository members;
  private final PickupContactRepository pickupContacts;
  private final WithdrawalGuard withdrawalGuard;
  private final jp.kusakari.ec.catalog.persistence.repository.StoreRepository stores;
  private final PendingOwnerSuccession pendingOwnerSuccession;
  private final EntityManager entityManager;

  public record PickupContact(
    @NotNull @Size(max = 100) String recipientName,
    @NotNull @Pattern(regexp = "[0-9+() -]{0,30}") String recipientPhone,
    @NotNull @Email @Size(max = 200) String contactEmail
  ) {}

  public record Member(
    String id,
    String name,
    String email,
    String accountType,
    List<Long> storeIds,
    boolean enabled,
    Instant withdrawnAt
  ) {}

  @Transactional(readOnly = true)
  public PickupContact pickupContact() {
    return pickupContacts
      .findById(auth.current().getId())
      .map(c -> new PickupContact(c.getRecipientName(), c.getRecipientPhone(), c.getContactEmail()))
      .orElse(new PickupContact("", "", ""));
  }

  public PickupContact savePickupContact(PickupContact input) {
    var name = input.recipientName().trim();
    var contact = new PickupContactEntity(auth.current().getId(), name, input.recipientPhone(), input.contactEmail());
    pickupContacts.save(contact);
    return new PickupContact(name, input.recipientPhone(), input.contactEmail());
  }

  public void deletePickupContact() {
    pickupContacts.deleteById(auth.current().getId());
  }

  /**
   * 退会する。承認待ちの譲渡先か、譲渡を申し出たオーナー本人なら、同じトランザクションで申し出を「自動で無効」にする（#205）。
   * ロックは「店舗 → 組織 → 会員」の順にする。注文の確定（店舗 → 組織）と、譲渡の申し出・承認（組織 → 所属 → 会員）と同じ向きなので、
   * 同時に起きても輪にならない。オーナーは組織の店舗をすべてロックしてから組織、担当者は組織から。
   * どれをロックするかはロックせずに読んだ会員の種別で決め、会員の行はロックの後に読み直して確かめる。
   */
  public void withdraw() {
    var current = auth.current();
    var id = current.getId();
    boolean lockedAsOwner = AuthMember.SHOP_OWNER.equals(current.getAccountType());
    // Checkout locks the same store rows in the same ascending order, so no new order can slip past the check.
    List<Long> storeIds = lockedAsOwner ? auth.storeIdsOf(current) : List.of();
    storeIds.forEach(stores::lock);
    var organization = pendingOwnerSuccession.lockOrganizationOf(id);
    var m = lockMember(id).orElseThrow();
    if (m.isAdmin()) throw new ApiException(
      409,
      "ADMIN_REQUIRED",
      "管理者はこの画面から退会できません。"
    );
    // ロックを待つ間に、譲渡の承認で担当者からオーナーになっていたら、店舗の行をロックしていないので確かめられない。
    // オーナーから担当者になっていたときは、ロックした店舗の行は使わず、担当者として確かめる。
    boolean owner = AuthMember.SHOP_OWNER.equals(m.getAccountType());
    if (owner && !lockedAsOwner) throw new ApiException(
      409,
      "WITHDRAWAL_ACCOUNT_CHANGED",
      "退会の手続きの間にアカウントの種類が変わりました。画面を読み込み直してから、もう一度お試しください。"
    );
    var purchases = withdrawalGuard.openPurchases(id);
    if (!purchases.isEmpty()) throw new WithdrawalBlockedException(
      "WITHDRAWAL_OPEN_ORDERS",
      "受け渡しが完了していない注文があるため退会できません。",
      purchases
    );
    // オーナーは、組織の店舗に出品中の商品か未完了の注文が残っている間は退会できない。
    if (owner && !storeIds.isEmpty()) {
      if (withdrawalGuard.hasListedProducts(storeIds)) throw new WithdrawalBlockedException(
        "WITHDRAWAL_LISTED_PRODUCTS",
        "出品中の商品があるため退会できません。すべての商品を販売停止にしてから再度お試しください。",
        List.of()
      );
      if (withdrawalGuard.hasOpenStoreOrders(storeIds)) throw new WithdrawalBlockedException(
        "WITHDRAWAL_STORE_ORDERS",
        "引き渡しが完了していない注文、または処理していないキャンセル申請があるため退会できません。",
        List.of()
      );
    }
    m.withdraw();
    organization.ifPresent(locked -> {
      pendingOwnerSuccession.invalidateFor(locked, id, Reason.SUCCESSOR_WITHDRAWN);
      pendingOwnerSuccession.invalidateForOwner(locked, id, Reason.OWNER_WITHDRAWN);
    });
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
          m.getAccountType(),
          auth.storeIdsOf(m),
          m.isEnabled(),
          m.getWithdrawnAt()
        )
      )
      .toList();
  }

  /**
   * 運営が会員の利用を停止・再開する。承認待ちの譲渡先か、譲渡を申し出たオーナー本人を停止したら、
   * 同じトランザクションで申し出を「自動で無効」にする（#205）。
   * 停止するときは、組織の行を会員の行より先にロックする（「店舗 → 組織 → 会員」の順。停止は店舗の行を使わないのでロックしない）。
   */
  public void enable(String id, boolean enabled) {
    auth.requireAdmin();
    Optional<OrganizationEntity> organization = enabled
      ? Optional.empty()
      : pendingOwnerSuccession.lockOrganizationOf(id);
    var m = lockMember(id).orElseThrow(() -> new ApiException(404, "MEMBER_NOT_FOUND", "会員が見つかりません。"));
    if (m.isAdmin() || m.getWithdrawnAt() != null) throw new ApiException(
      409,
      "MEMBER_FIXED",
      "管理者または退会済み会員の状態は変更できません。"
    );
    m.changeEnabled(enabled);
    organization.ifPresent(locked -> {
      pendingOwnerSuccession.invalidateFor(locked, id, Reason.SUCCESSOR_DISABLED);
      pendingOwnerSuccession.invalidateForOwner(locked, id, Reason.OWNER_DISABLED);
    });
  }

  /**
   * 会員の行を PESSIMISTIC_WRITE でロックし、DB の今の値で読み直す。
   * ログイン中の本人は読み込み済みで、ロックするクエリだけでは、ロックを待つ間に変わった値（譲渡の承認での種別など）が古いままになるため。
   */
  private Optional<AuthMember> lockMember(String id) {
    return members.findById(id).map(member -> {
      entityManager.refresh(member, LockModeType.PESSIMISTIC_WRITE);
      return member;
    });
  }
}
