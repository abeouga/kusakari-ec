package jp.kusakari.ec.notification.service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
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

  public record Notice(String id, String title, String body, java.time.Instant createdAt, java.time.Instant readAt) {}

  public void send(String memberId, String title, String body) {
    if (memberId != null) notices.save(new NotificationEntity(memberId, title, body));
  }

  /** 店舗の組織のオーナーと、ロールが割り振られた担当者のうち、有効な会員に送る。 */
  public void toStore(Long storeId, String title, String body) {
    var store = storeId == null ? null : stores.findById(storeId).orElse(null);
    if (store == null) return;
    Set<String> recipients = new LinkedHashSet<>();
    organizations.findById(store.getOrganizationId()).map(OrganizationEntity::getOwnerMemberId).ifPresent(recipients::add);
    storeMembers.findAssignedAtStore(storeId).forEach(assignment -> recipients.add(assignment.getId().getMemberId()));
    members.findAllById(recipients).stream().filter(AuthMember::isEnabled).forEach(m -> send(m.getId(), title, body));
  }

  @Transactional(readOnly = true)
  public List<Notice> list() {
    return notices
      .findByMemberIdOrderByCreatedAtDesc(auth.current().getId())
      .stream()
      .map(n -> new Notice(n.getId(), n.getTitle(), n.getBody(), n.getCreatedAt(), n.getReadAt()))
      .toList();
  }

  public void read(String id) {
    var n = notices
      .findById(id)
      .filter(x -> x.getMemberId().equals(auth.current().getId()))
      .orElseThrow(() -> new ApiException(404, "NOTICE_NOT_FOUND", "通知が見つかりません。"));
    n.markRead();
  }
}
