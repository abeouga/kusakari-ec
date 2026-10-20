package jp.kusakari.ec.notification.service;

import java.util.List;
import jp.kusakari.ec.auth.AuthMemberRepository;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.notification.persistence.entity.NotificationEntity;
import jp.kusakari.ec.notification.persistence.repository.NotificationRepository;
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

  public record Notice(String id, String title, String body, java.time.Instant createdAt, java.time.Instant readAt) {}

  public void send(String memberId, String title, String body) {
    if (memberId != null) notices.save(new NotificationEntity(memberId, title, body));
  }

  public void toStore(Long storeId, String title, String body) {
    if (storeId != null) members.findByStoreIdAndEnabledTrue(storeId).forEach(m -> send(m.getId(), title, body));
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
