package jp.kusakari.ec.notification.service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthMemberRepository;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.notification.persistence.entity.NotificationEntity;
import jp.kusakari.ec.notification.persistence.repository.NotificationRepository;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import jp.kusakari.ec.store.persistence.repository.StoreMemberRepository;
import jp.kusakari.ec.store.service.PendingOwnerSuccession;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class NotificationService {

  private final NotificationRepository notices;
  private final AuthMemberRepository members;
  private final AuthService auth;
  private final StoreRepository stores;
  private final OrganizationRepository organizations;
  private final StoreMemberRepository storeMembers;
  private final PendingOwnerSuccession pendingOwnerSuccession;

  /** category は通知の種類（NotificationEntity の ORDER など）。重要かどうかは画面が種類から決める。 */
  public record Notice(
    String id,
    String category,
    String title,
    String body,
    java.time.Instant createdAt,
    java.time.Instant readAt
  ) {}

  /** category は NotificationEntity の ORDER などの種類。どれにも当てはまらなければ GENERAL。 */
  public void send(String memberId, String category, String title, String body) {
    if (memberId != null) notices.save(new NotificationEntity(memberId, category, title, body));
  }

  /** 店舗の組織のオーナーと、ロールが割り振られた担当者のうち、有効な会員に送る。 */
  public void toStore(Long storeId, String category, String title, String body) {
    var store = storeId == null ? null : stores.findById(storeId).orElse(null);
    if (store == null) return;
    Set<String> recipients = new LinkedHashSet<>();
    organizations.findById(store.getOrganizationId()).map(OrganizationEntity::getOwnerMemberId).ifPresent(recipients::add);
    storeMembers.findAssignedAtStore(storeId).forEach(assignment -> recipients.add(assignment.getId().getMemberId()));
    members
      .findAllById(recipients)
      .stream()
      .filter(AuthMember::isEnabled)
      .forEach(m -> notices.save(NotificationEntity.forStore(m.getId(), storeId, category, title, body)));
  }

  /**
   * 通知一覧。読み込むときに、自分がオーナーか譲渡先の、期限が過ぎた譲渡の申し出を無効として記録する（#194 の 15）。
   * そのとき送る「譲渡の結果」の通知は同じトランザクションで保存してから一覧を読むので、この一覧にもう含まれている。
   */
  public List<Notice> list() {
    var member = auth.current();
    pendingOwnerSuccession.expireIfDueFor(member.getId());
    var visible = visibility(member);
    return notices
      .findByMemberIdOrderByCreatedAtDesc(member.getId())
      .stream()
      .filter(visible)
      .map(n -> new Notice(n.getId(), n.getCategory(), n.getTitle(), n.getBody(), n.getCreatedAt(), n.getReadAt()))
      .toList();
  }

  public void read(String id) {
    var member = auth.current();
    var n = notices
      .findById(id)
      .filter(x -> x.getMemberId().equals(member.getId()))
      .filter(visibility(member))
      .orElseThrow(() -> new ApiException(404, "NOTICE_NOT_FOUND", "通知が見つかりません。"));
    n.markRead();
  }

  /**
   * 担当者（SHOP_STAFF）が見られる通知（#169）。本人あての通知はいつでも見られる。
   * 店舗あての通知は、その店舗に所属している間だけ見られる（外される前に見えていた通知も見えなくなる）。
   * 店舗を持たない V5 より前の店舗あての通知は、どこかの店舗に所属している間だけ見られる。
   * オーナー・購入者・運営は、自分あての通知をすべて見られる。
   */
  private Predicate<NotificationEntity> visibility(AuthMember member) {
    if (!AuthMember.SHOP_STAFF.equals(member.getAccountType())) return notice -> true;
    Set<Long> stores = storeMembers
      .findAllForMember(member.getId())
      .stream()
      .map(assignment -> assignment.getId().getStoreId())
      .collect(Collectors.toSet());
    return notice ->
      NotificationEntity.PERSONAL.equals(notice.getKind()) ||
      (notice.getStoreId() == null ? !stores.isEmpty() : stores.contains(notice.getStoreId()));
  }
}
