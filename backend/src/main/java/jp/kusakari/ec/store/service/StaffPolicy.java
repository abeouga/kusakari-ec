package jp.kusakari.ec.store.service;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEntity;
import jp.kusakari.ec.store.persistence.entity.StoreMemberEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import jp.kusakari.ec.store.persistence.repository.StoreMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 人事（アカウント一覧・ロールの割り振り・招待キー）の権限の対応表（#105、#111）。判定はここだけで行う。
 *
 * <pre>
 * できること                         オーナー  ORG_ADMIN  MANAGER        STAFF / ロールなし
 * アカウント一覧                      組織の全員 組織の全員 自分の店舗の担当者 不可
 * MANAGER の割り振り・解除            全店舗    全店舗     不可           不可
 * STAFF の割り振り・解除              全店舗    全店舗     自分の店舗     不可
 * 別の店舗の担当の追加・外す          全店舗    全店舗     不可           不可
 * ORG_ADMIN の付け外し                できる    不可       不可           不可
 * 招待キーの発行・一覧・取り消し      全店舗    全店舗     自分の店舗     不可
 * </pre>
 *
 * オーナー自身は一覧に出るが、ロールを変えられない（オーナーは店舗のロールを持たず、組織の全店舗を扱う）。
 * 商品・在庫・注文は、ORG_ADMIN でも店舗のロール（{@link AuthService#requireSeller}）に従う。
 */
@Component
@RequiredArgsConstructor
public class StaffPolicy {

  public static final String NONE = "NONE";

  private final AuthService auth;
  private final OrganizationRepository organizations;
  private final OrganizationMemberRepository organizationMembers;
  private final StoreMemberRepository storeMembers;

  /** 操作する人の立場。managerStores は MANAGER のロールがある店舗。 */
  public record Viewer(
    String memberId,
    long organizationId,
    boolean owner,
    boolean organizationAdmin,
    Set<Long> managerStores
  ) {
    /** 組織の全員を扱える（オーナーか ORG_ADMIN）。 */
    public boolean personnel() {
      return owner || organizationAdmin;
    }

    public boolean canSeeAccounts() {
      return personnel() || !managerStores.isEmpty();
    }

    public boolean canInvite(long storeId) {
      return personnel() || managerStores.contains(storeId);
    }

    /**
     * その担当者の、その店舗のロールとして選べる値（MANAGER・STAFF・NONE = 未割り当て）。空なら変えられない。
     * current は今のロール（未割り当ては NONE、担当でなければ null）。
     */
    public List<String> assignableRoles(String targetId, long storeId, String current) {
      if (personnel()) return List.of(StoreMemberEntity.MANAGER, StoreMemberEntity.STAFF, NONE);
      boolean lower = NONE.equals(current) || StoreMemberEntity.STAFF.equals(current);
      if (managerStores.contains(storeId) && lower && !targetId.equals(memberId)) {
        return List.of(StoreMemberEntity.STAFF, NONE);
      }
      return List.of();
    }

    /** 店舗の担当を外す（別の店舗の担当の解除）。オーナーと ORG_ADMIN だけ。 */
    public boolean canRemoveAssignment() {
      return personnel();
    }

    /** ORG_ADMIN の付け外し。オーナーだけ。 */
    public boolean canChangeOrganizationRole() {
      return owner;
    }
  }

  /** ログインしている店舗側のアカウントの立場。組織がなければ 403。 */
  public Viewer viewer() {
    AuthMember member = auth.current();
    if (AuthMember.SHOP_OWNER.equals(member.getAccountType())) {
      OrganizationEntity organization = organizations
        .findByOwnerMemberId(member.getId())
        .orElseThrow(StaffPolicy::denied);
      return new Viewer(member.getId(), organization.getId(), true, false, Set.of());
    }
    if (!AuthMember.SHOP_STAFF.equals(member.getAccountType())) throw denied();
    OrganizationMemberEntity membership = organizationMembers
      .findForMember(member.getId())
      .orElseThrow(StaffPolicy::denied);
    Set<Long> managed = storeMembers
      .findAllForMember(member.getId())
      .stream()
      .filter(assignment -> StoreMemberEntity.MANAGER.equals(assignment.getRole()))
      .map(assignment -> assignment.getId().getStoreId())
      .collect(Collectors.toUnmodifiableSet());
    return new Viewer(
      member.getId(),
      membership.getId().getOrganizationId(),
      false,
      membership.isOrganizationAdmin(),
      managed
    );
  }

  public static ApiException denied() {
    return new ApiException(403, "FORBIDDEN", "この操作の権限がありません。");
  }
}
