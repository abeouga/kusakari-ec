package jp.kusakari.ec.store.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthMemberRepository;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberId;
import jp.kusakari.ec.store.persistence.entity.StoreMemberEntity;
import jp.kusakari.ec.store.persistence.entity.StoreMemberId;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
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
    List<Assignment> assignments
  ) {}

  public record AccountsView(
    long organizationId,
    boolean owner,
    boolean organizationAdmin,
    List<StoreRef> stores,
    List<Account> accounts
  ) {}

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
    List<Account> accounts = new ArrayList<>();
    if (viewer.personnel()) {
      organizations
        .findById(viewer.organizationId())
        .map(OrganizationEntity::getOwnerMemberId)
        .flatMap(members::findById)
        .ifPresent(owner ->
          accounts.add(
            new Account(owner.getId(), owner.getDisplayName(), owner.getEmail(), true, null, false, List.of())
          )
        );
    }
    for (OrganizationMemberEntity membership : organizationMembers.findAllInOrganization(viewer.organizationId())) {
      String memberId = membership.getId().getMemberId();
      var assigned = byMember.getOrDefault(memberId, List.of());
      // MANAGER は、自分の店舗の担当者だけを見る（#111）。
      if (!viewer.personnel() && assigned.isEmpty()) continue;
      var member = members.findById(memberId).orElse(null);
      if (member == null) continue;
      Map<Long, StoreMemberEntity> roles = assigned
        .stream()
        .collect(Collectors.toMap(assignment -> assignment.getId().getStoreId(), Function.identity()));
      var rows = visibleStores
        .stream()
        .map(store -> {
          var assignment = roles.get(store.getId());
          String role = assignment == null ? null : roleOf(assignment);
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
          viewer.canChangeOrganizationRole(),
          rows
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
      accounts
    );
  }

  /** 店舗のロールを割り振る。role は MANAGER・STAFF・NONE（未割り当て）。担当でない店舗なら、担当に加える。 */
  public AccountsView assign(String memberId, long storeId, String role) {
    var viewer = policy.viewer();
    var store = storeOf(viewer, storeId);
    membershipOf(viewer, memberId);
    var existing = storeMembers.findById(new StoreMemberId(storeId, memberId));
    String current = existing.map(StaffAccountService::roleOf).orElse(null);
    if (!viewer.assignableRoles(memberId, storeId, current).contains(role)) throw StaffPolicy.denied();
    String value = StaffPolicy.NONE.equals(role) ? null : role;
    if (existing.isPresent()) existing.get().changeRole(value);
    else storeMembers.save(new StoreMemberEntity(store.getId(), memberId, viewer.organizationId(), value));
    storeMembers.flush();
    return list();
  }

  /** 店舗の担当から外す。組織への所属は残る。 */
  public AccountsView removeAssignment(String memberId, long storeId) {
    var viewer = policy.viewer();
    storeOf(viewer, storeId);
    membershipOf(viewer, memberId);
    if (!viewer.canRemoveAssignment()) throw StaffPolicy.denied();
    var existing = storeMembers
      .findById(new StoreMemberId(storeId, memberId))
      .orElseThrow(() -> new ApiException(404, "ASSIGNMENT_NOT_FOUND", "この店舗の担当ではありません。"));
    storeMembers.delete(existing);
    storeMembers.flush();
    return list();
  }

  /** ORG_ADMIN の付け外し（オーナーだけ）。 */
  public AccountsView changeOrganizationRole(String memberId, boolean organizationAdmin) {
    var viewer = policy.viewer();
    if (!viewer.canChangeOrganizationRole()) throw StaffPolicy.denied();
    membershipOf(viewer, memberId).changeRole(organizationAdmin ? OrganizationMemberEntity.ORG_ADMIN : null);
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
    return organizationMembers
      .findById(new OrganizationMemberId(viewer.organizationId(), memberId))
      .filter(membership -> members.findById(memberId).map(AuthMember::isEnabled).orElse(false))
      .orElseThrow(() -> new ApiException(404, "ACCOUNT_NOT_FOUND", "アカウントが見つかりません。"));
  }

  private static String roleOf(StoreMemberEntity assignment) {
    return assignment.getRole() == null ? StaffPolicy.NONE : assignment.getRole();
  }
}
