package jp.kusakari.ec.store.service;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.moderation.dto.ModerationDtos;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreService {

  private final StoreRepository stores;
  private final OrganizationRepository organizations;
  private final AuthService auth;
  private final OpenOrders openOrders;
  private final StoreModerationService moderation;

  /**
   * company は組織の名前（事業者名の正本）。enabled は「運営が停止していない」、published は「オーナーが公開した」。
   * closingStartedAt は閉鎖を始めた日時（空なら営業中）。日時があれば、画面は「閉店予定」と出す。
   * closingStartedBy は閉鎖を始めた人（OWNER・ADMIN）、closedAt は閉鎖済みになった日時（#79）。
   * openOrderCount は閉鎖を止めている未完了の注文の件数で、出店者と運営の店舗一覧だけで返す（公開ページは null）。
   * memberRole は出店者画面の店舗一覧（GET /api/seller/stores）だけで返す、その店舗での自分の立場
   * （OWNER・MANAGER・STAFF・NONE＝所属でロールなし・ADMIN＝運営。空＝担当外で、ORG_ADMIN の人事の画面だけ）。
   * warning は運営の今出ている警告（#16）。出店者と運営にだけ返し、購入者・未ログインの公開ページは null。
   */
  public record Profile(
    long id,
    long revision,
    long organizationId,
    String name,
    String company,
    String contact,
    String email,
    String address,
    String hours,
    String story,
    boolean enabled,
    boolean published,
    Instant closingStartedAt,
    String memberRole,
    String closingStartedBy,
    Instant closedAt,
    Long openOrderCount,
    ModerationDtos.Warning warning
  ) {}

  public record Input(
    long revision,
    @NotBlank @Size(max = 100) String name,
    @NotNull @Size(max = 100) String contact,
    @NotNull @Email @Size(max = 200) String email,
    @NotBlank @Size(max = 200) String address,
    @NotBlank @Size(max = 80) String hours,
    @NotNull @Size(max = 1000) String story
  ) {}

  /**
   * 店舗の公開ページ。購入者・未ログインには、公開中の店舗と閉鎖予定（閉鎖中）の店舗だけを返す。
   * 非公開・運営の停止・閉鎖済み・組織の停止の店舗は、ないものとして 404。オーナー・担当者・運営は、扱える店舗を見られる。
   */
  @Transactional(readOnly = true)
  public Profile get(long id) {
    var store = require(id);
    boolean staff = auth.canViewAsStaff(store);
    if (!publiclyVisible(store) && !staff) throw notFound();
    if (!staff) return view(store);
    return withWarning(view(store), moderation.warnings(List.of(id)).get(id));
  }

  private boolean publiclyVisible(StoreEntity store) {
    if (!store.isPublished() || store.isSuspended() || store.getClosedAt() != null) return false;
    return organizations
      .findById(store.getOrganizationId())
      .map(organization -> !organization.isSuspended())
      .orElse(false);
  }

  @Transactional(readOnly = true)
  public List<Profile> list() {
    auth.requireAdmin();
    return managedList(stores.findAllByOrderByIdAsc());
  }

  /** 閉鎖の操作の後に返す店舗（未完了の注文の件数つき）。操作の権限は呼ぶ前に確かめている。 */
  @Transactional(readOnly = true)
  public Profile managed(long id) {
    return managedList(List.of(require(id))).get(0);
  }

  /** ログインしている店舗側のアカウントが操作できる店舗。運営には全店舗を返す。 */
  @Transactional(readOnly = true)
  public List<Profile> mine() {
    auth.requireSellerRole();
    AuthMember member = auth.current();
    if (member.isAdmin()) return managedList(stores.findAllByOrderByIdAsc());
    // ロール未割り当ての担当者も、所属店舗の店舗情報は見られる（#105）。ORG_ADMIN には組織の全店舗を候補に出す（#112）。
    // 変更の API は、それぞれロールを確かめる。
    List<StoreEntity> mine = stores
      .findAllById(auth.candidateStoreIdsOf(member))
      .stream()
      .sorted(java.util.Comparator.comparing(StoreEntity::getId))
      .toList();
    Map<Long, ModerationDtos.Warning> warnings = moderation.warnings(mine.stream().map(StoreEntity::getId).toList());
    return mine
      .stream()
      .map(store ->
        withRole(withWarning(withOpenOrders(store), warnings.get(store.getId())), auth.memberRoleAt(member, store))
      )
      .toList();
  }

  /** オーナーが、自分の組織に店舗を作る。申請や運営の審査は要らない。作った直後は非公開。 */
  public Profile create(Input in) {
    OrganizationEntity organization = auth.requireOwnedOrganization();
    String name = in.name().trim();
    if (stores.existsByOrganizationIdAndName(organization.getId(), name)) throw new ApiException(
      409,
      "STORE_NAME_EXISTS",
      "同じ名前の店舗がすでにあります。"
    );
    var store = StoreEntity.create(
      organization.getId(),
      name,
      in.contact(),
      in.email(),
      in.address(),
      in.hours(),
      in.story()
    );
    return view(stores.saveAndFlush(store));
  }

  public Profile save(long id, Input in) {
    auth.requireManager(id);
    var s = require(id);
    requireNotClosed(s);
    if (s.getRevision() != in.revision()) throw new ApiException(409, "STORE_CHANGED", "店舗情報が更新されています。");
    String name = in.name().trim();
    if (
      !name.equals(s.getName()) && stores.existsByOrganizationIdAndName(s.getOrganizationId(), name)
    ) throw new ApiException(409, "STORE_NAME_EXISTS", "同じ名前の店舗がすでにあります。");
    s.updateProfile(name, in.contact(), in.email(), in.address(), in.hours(), in.story());
    stores.flush();
    return view(s);
  }

  /** オーナーによる公開・非公開。運営の停止とは別の列なので、停止が解除されても未公開の店舗は公開されない。 */
  public Profile publish(long id, boolean published) {
    var s = require(id);
    auth.requireOwnerOf(s);
    requireNotClosed(s);
    s.changePublished(published);
    stores.flush();
    return view(s);
  }

  private static void requireNotClosed(StoreEntity store) {
    if (store.getClosedAt() != null) throw new ApiException(409, "STORE_CLOSED", "この店舗は閉鎖済みです。");
  }

  private StoreEntity require(long id) {
    return stores.findById(id).orElseThrow(StoreService::notFound);
  }

  private static ApiException notFound() {
    return new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。");
  }

  private Profile view(StoreEntity s) {
    String company = organizations.findById(s.getOrganizationId()).map(OrganizationEntity::getName).orElse("");
    return new Profile(
      s.getId(),
      s.getRevision(),
      s.getOrganizationId(),
      s.getName(),
      company,
      s.getContact(),
      s.getEmail(),
      s.getAddress(),
      s.getHours(),
      s.getStory(),
      !s.isSuspended(),
      s.isPublished(),
      s.getClosingStartedAt(),
      null,
      s.getClosingStartedBy(),
      s.getClosedAt(),
      null,
      null
    );
  }

  // 出店者・運営の一覧：未完了の注文の件数と、運営の警告をつける。
  private List<Profile> managedList(List<StoreEntity> list) {
    Map<Long, ModerationDtos.Warning> warnings = moderation.warnings(list.stream().map(StoreEntity::getId).toList());
    return list.stream().map(s -> withWarning(withOpenOrders(s), warnings.get(s.getId()))).toList();
  }

  private Profile withOpenOrders(StoreEntity s) {
    Profile p = view(s);
    return withRole(p, null, openOrders.count(List.of(s.getId())));
  }

  private static Profile withRole(Profile p, String role) {
    return copy(p, role, p.openOrderCount(), p.warning());
  }

  private static Profile withRole(Profile p, String role, Long openOrderCount) {
    return copy(p, role, openOrderCount, p.warning());
  }

  private static Profile withWarning(Profile p, ModerationDtos.Warning warning) {
    return copy(p, p.memberRole(), p.openOrderCount(), warning);
  }

  private static Profile copy(Profile p, String role, Long openOrderCount, ModerationDtos.Warning warning) {
    return new Profile(
      p.id(),
      p.revision(),
      p.organizationId(),
      p.name(),
      p.company(),
      p.contact(),
      p.email(),
      p.address(),
      p.hours(),
      p.story(),
      p.enabled(),
      p.published(),
      p.closingStartedAt(),
      role,
      p.closingStartedBy(),
      p.closedAt(),
      openOrderCount,
      warning
    );
  }
}
