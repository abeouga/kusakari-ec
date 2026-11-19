package jp.kusakari.ec.store.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthMemberRepository;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.notification.persistence.entity.NotificationEntity;
import jp.kusakari.ec.notification.service.NotificationService;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEventEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberId;
import jp.kusakari.ec.store.persistence.entity.StoreInvitationEntity;
import jp.kusakari.ec.store.persistence.entity.StoreMemberEntity;
import jp.kusakari.ec.store.persistence.entity.StoreMemberId;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberEventRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import jp.kusakari.ec.store.persistence.repository.StoreInvitationRepository;
import jp.kusakari.ec.store.persistence.repository.StoreMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** アカウント一覧と、店舗のロール・ORG_ADMIN の割り振り（#111）。権限は {@link StaffPolicy} の対応表に従う。 */
@Service
@RequiredArgsConstructor
@Transactional
public class StaffAccountService {

  private final StaffPolicy policy;
  private final AuthMemberRepository members;
  private final OrganizationRepository organizations;
  private final OrganizationMemberRepository organizationMembers;
  private final StoreMemberRepository storeMembers;
  private final StoreRepository stores;
  private final OrganizationMemberEventRepository events;
  private final StoreInvitationRepository invitations;
  private final NotificationService notices;
  private final PendingOwnerSuccession pendingOwnerSuccession;

  public record StoreRef(long id, String name) {}

  /** role は MANAGER・STAFF・NONE（未割り当て）か、担当でなければ空。assignableRoles は、操作する人が選べる値。 */
  public record Assignment(long storeId, String role, List<String> assignableRoles, boolean removable) {}

  public record Account(
    String memberId,
    String name,
    String email,
    boolean owner,
    String organizationRole,
    boolean organizationRoleEditable,
    List<Assignment> assignments,
    /** 組織から除名中（#175）。画面は既定で隠し、絞り込みで出す（#173 の決めること4）。 */
    boolean expelled,
    /** 操作する人が、この人を除名・復帰させられるか。 */
    boolean expellable,
    /** オーナーが今この人に譲渡を申し出られるか（#203）。オーナー以外と、承認待ちがある間は常に偽。 */
    boolean ownerSuccessionSelectable
  ) {}

  /** 承認を待っている譲渡の申し出（#203）。期限が過ぎた申し出は出さない。 */
  public record OwnerSuccession(String memberId, String name, String email, Instant expiresAt) {}

  public record AccountsView(
    long organizationId,
    boolean owner,
    boolean organizationAdmin,
    List<StoreRef> stores,
    List<Account> accounts,
    /** 承認待ちの譲渡の申し出。オーナーにだけ返し、ほかの人には空（#195 の 7）。 */
    OwnerSuccession ownerSuccession
  ) {}

  /** アカウント一覧を開く。期限が過ぎた譲渡の申し出は、ここで見つけて無効として記録する（#194 の 15）。 */
  public AccountsView open() {
    var viewer = policy.viewer();
    if (!viewer.canSeeAccounts()) throw StaffPolicy.denied();
    pendingOwnerSuccession.expireIfDue(viewer.organizationId());
    return list();
  }

  @Transactional(readOnly = true)
  public AccountsView list() {
    var viewer = policy.viewer();
    if (!viewer.canSeeAccounts()) throw StaffPolicy.denied();
    List<StoreEntity> visibleStores = stores
      .findByOrganizationIdOrderByIdAsc(viewer.organizationId())
      .stream()
      .filter(store -> viewer.personnel() || viewer.managerStores().contains(store.getId()))
      .toList();
    var storeIds = visibleStores.stream().map(StoreEntity::getId).collect(Collectors.toSet());
    Map<String, List<StoreMemberEntity>> byMember = storeMembers
      .findAllInOrganization(viewer.organizationId())
      .stream()
      .filter(assignment -> storeIds.contains(assignment.getId().getStoreId()))
      .collect(Collectors.groupingBy(assignment -> assignment.getId().getMemberId()));
    OrganizationEntity organization = organizations.findById(viewer.organizationId()).orElseThrow(StaffPolicy::denied);
    Instant now = Instant.now();
    boolean succession = viewer.canHandOverOwnership();
    boolean pending = organization.hasPendingOwnerSuccession(now);
    List<Account> accounts = new ArrayList<>();
    if (viewer.personnel() && organization.getOwnerMemberId() != null) {
      members
        .findById(organization.getOwnerMemberId())
        .ifPresent(owner ->
          accounts.add(
            new Account(
              owner.getId(),
              owner.getDisplayName(),
              owner.getEmail(),
              true,
              null,
              false,
              List.of(),
              false,
              false,
              false
            )
          )
        );
    }
    for (OrganizationMemberEntity membership : organizationMembers.findAllInOrganization(viewer.organizationId())) {
      String memberId = membership.getId().getMemberId();
      var assigned = byMember.getOrDefault(memberId, List.of());
      // MANAGER は、自分の店舗の担当者だけを見る（#111）。
      if (!viewer.personnel() && assigned.isEmpty()) continue;
      // 除名中の人は、除名・復帰を扱うオーナーと ORG_ADMIN にだけ見せる（#175）。
      boolean expelled = membership.isExpelled();
      if (expelled && !viewer.personnel()) continue;
      var member = members.findById(memberId).orElse(null);
      if (member == null) continue;
      // 譲渡先にできるのは、除名中・停止中・退会済みでない人。ロールの制限はない（#181 の 2）。
      boolean selectable = succession && !pending && !expelled && member.isEnabled() && member.getWithdrawnAt() == null;
      Map<Long, StoreMemberEntity> roles = assigned
        .stream()
        .collect(Collectors.toMap(assignment -> assignment.getId().getStoreId(), Function.identity()));
      var rows = visibleStores
        .stream()
        .map(store -> {
          var assignment = roles.get(store.getId());
          String role = assignment == null ? null : roleOf(assignment);
          // 除名中は担当とロールを残したまま変えさせない。復帰したら元の店舗に戻る（#173 の決めること3）。
          if (expelled) return new Assignment(store.getId(), role, List.of(), false);
          boolean removable = assignment != null && viewer.canRemoveAssignment();
          return new Assignment(store.getId(), role, viewer.assignableRoles(memberId, store.getId(), role), removable);
        })
        .toList();
      accounts.add(
        new Account(
          memberId,
          member.getDisplayName(),
          member.getEmail(),
          false,
          membership.getRole(),
          viewer.canChangeOrganizationRole() && !expelled,
          rows,
          expelled,
          viewer.canExpel(memberId),
          selectable
        )
      );
    }
    accounts.sort(Comparator.comparing(Account::owner).reversed().thenComparing(Account::email));
    return new AccountsView(
      viewer.organizationId(),
      viewer.owner(),
      viewer.organizationAdmin(),
      visibleStores
        .stream()
        .map(store -> new StoreRef(store.getId(), store.getName()))
        .toList(),
      accounts,
      succession && pending ? ownerSuccessionOf(organization) : null
    );
  }

  private OwnerSuccession ownerSuccessionOf(OrganizationEntity organization) {
    String id = organization.getPendingOwnerMemberId();
    var member = members.findById(id);
    return new OwnerSuccession(
      id,
      member.map(AuthMember::getDisplayName).orElse(""),
      member.map(AuthMember::getEmail).orElse(""),
      organization.getPendingOwnerExpiresAt()
    );
  }

  /** 店舗のロールを割り振る。role は MANAGER・STAFF・NONE（未割り当て）。担当でない店舗なら、担当に加える。 */
  public AccountsView assign(String memberId, long storeId, String role) {
    var viewer = policy.viewer();
    var store = storeOf(viewer, storeId);
    activeMembershipOf(viewer, memberId);
    var existing = storeMembers.findById(new StoreMemberId(storeId, memberId));
    String current = existing.map(StaffAccountService::roleOf).orElse(null);
    if (!viewer.assignableRoles(memberId, storeId, current).contains(role)) throw StaffPolicy.denied();
    String value = StaffPolicy.NONE.equals(role) ? null : role;
    if (existing.isPresent()) existing.get().changeRole(value);
    else {
      storeMembers.save(new StoreMemberEntity(store.getId(), memberId, viewer.organizationId(), value));
      // ロールの変更は担当の出入りではないので、担当に加えたときだけ記録する（#178）。
      record(viewer, OrganizationMemberEventEntity.ASSIGN_TO_STORE, memberId, storeId);
    }
    storeMembers.flush();
    return list();
  }

  /** 店舗の担当から外す。組織への所属は残り、本人に通知する（#169）。 */
  public AccountsView removeAssignment(String memberId, long storeId) {
    var viewer = policy.viewer();
    var store = storeOf(viewer, storeId);
    activeMembershipOf(viewer, memberId);
    if (!viewer.canRemoveAssignment()) throw StaffPolicy.denied();
    var existing = storeMembers
      .findById(new StoreMemberId(storeId, memberId))
      .orElseThrow(() -> new ApiException(404, "ASSIGNMENT_NOT_FOUND", "この店舗の担当ではありません。"));
    storeMembers.delete(existing);
    record(viewer, OrganizationMemberEventEntity.REMOVE_FROM_STORE, memberId, storeId);
    // 本人あての通知なので、どの店舗にも所属していなくても見られる（#169）。除名では通知しない（#168）。
    notices.send(
      memberId,
      NotificationEntity.GENERAL,
      "店舗の担当から外れました",
      store.getName() + "の担当から外れました。組織には所属しています。"
    );
    storeMembers.flush();
    return list();
  }

  /** ORG_ADMIN の付け外し（オーナーだけ）。 */
  public AccountsView changeOrganizationRole(String memberId, boolean organizationAdmin) {
    var viewer = policy.viewer();
    if (!viewer.canChangeOrganizationRole()) throw StaffPolicy.denied();
    activeMembershipOf(viewer, memberId).changeRole(organizationAdmin ? OrganizationMemberEntity.ORG_ADMIN : null);
    organizationMembers.flush();
    return list();
  }

  /**
   * 組織から除名する（#175）。データは消さず、所属の除名中の印だけを立てる（#173）。
   * 除名された人は次の要求からログインできなくなり、本人には通知しない（#168 の決めること6）。
   * その人が発行した招待キーは取り消し、キャンセル・返金の操作者や通知の記録は残す（#153 の項目5・6）。
   * 承認待ちの譲渡先を除名したら、同じトランザクションで申し出を「自動で無効」にする（#194 の 7・8・13・14、#196 の 5）。
   * 譲渡の申し出・承認と同じく、組織の行をロックしてから所属の行をロックして読み直す。
   */
  public AccountsView expel(String memberId) {
    var viewer = policy.viewer();
    OrganizationEntity organization = pendingOwnerSuccession.lock(viewer.organizationId());
    var membership = enabled(organizationMembers.lock(viewer.organizationId(), memberId));
    if (!viewer.canExpel(memberId)) throw StaffPolicy.denied();
    if (membership.isExpelled()) throw expelled();
    membership.expel();
    invitations.findByIssuedByMemberIdAndRevokedAtIsNull(memberId).forEach(StoreInvitationEntity::revoke);
    recordOrganization(viewer, OrganizationMemberEventEntity.EXPEL_FROM_ORGANIZATION, memberId);
    pendingOwnerSuccession.invalidateFor(organization, memberId, PendingOwnerSuccession.Reason.SUCCESSOR_EXPELLED);
    organizationMembers.flush();
    return list();
  }

  /** 除名した人を組織に復帰させる。担当とロールは除名前のまま戻る（#173 の決めること3）。 */
  public AccountsView reinstate(String memberId) {
    var viewer = policy.viewer();
    var membership = membershipOf(viewer, memberId);
    if (!viewer.canExpel(memberId)) throw StaffPolicy.denied();
    if (!membership.isExpelled()) {
      throw new ApiException(409, "ACCOUNT_NOT_EXPELLED", "このアカウントは除名されていません。");
    }
    membership.reinstate();
    recordOrganization(viewer, OrganizationMemberEventEntity.REINSTATE_TO_ORGANIZATION, memberId);
    organizationMembers.flush();
    return list();
  }

  private StoreEntity storeOf(StaffPolicy.Viewer viewer, long storeId) {
    return stores
      .findById(storeId)
      .filter(store -> store.getOrganizationId().equals(viewer.organizationId()))
      .orElseThrow(() -> new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。"));
  }

  /** 同じ組織の担当者。オーナー・別の組織の会員は、見つからないものとして扱う。 */
  private OrganizationMemberEntity membershipOf(StaffPolicy.Viewer viewer, String memberId) {
    return enabled(organizationMembers.findById(new OrganizationMemberId(viewer.organizationId(), memberId)));
  }

  /** 停止中・退会済みの会員の所属も、見つからないものとして扱う。 */
  private OrganizationMemberEntity enabled(Optional<OrganizationMemberEntity> membership) {
    return membership
      .filter(found -> members.findById(found.getId().getMemberId()).map(AuthMember::isEnabled).orElse(false))
      .orElseThrow(() -> new ApiException(404, "ACCOUNT_NOT_FOUND", "アカウントが見つかりません。"));
  }

  /** 除名中でない同じ組織の担当者。除名中の人の担当とロールは、復帰するまで変えさせない。 */
  private OrganizationMemberEntity activeMembershipOf(StaffPolicy.Viewer viewer, String memberId) {
    var membership = membershipOf(viewer, memberId);
    if (membership.isExpelled()) throw expelled();
    return membership;
  }

  private static ApiException expelled() {
    return new ApiException(409, "ACCOUNT_EXPELLED", "このアカウントは組織から除名されています。");
  }

  private void recordOrganization(StaffPolicy.Viewer viewer, String eventType, String memberId) {
    events.save(
      OrganizationMemberEventEntity.ofOrganization(viewer.organizationId(), eventType, viewer.memberId(), memberId)
    );
  }

  /** 担当の出入りを、操作と同じトランザクションで記録に足す（#178）。 */
  private void record(StaffPolicy.Viewer viewer, String eventType, String memberId, long storeId) {
    events.save(
      OrganizationMemberEventEntity.ofStore(viewer.organizationId(), eventType, viewer.memberId(), memberId, storeId)
    );
  }

  private static String roleOf(StoreMemberEntity assignment) {
    return assignment.getRole() == null ? StaffPolicy.NONE : assignment.getRole();
  }
}
