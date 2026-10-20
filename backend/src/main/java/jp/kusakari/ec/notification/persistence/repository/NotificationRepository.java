package jp.kusakari.ec.notification.persistence.repository;

import java.util.*;
import jp.kusakari.ec.notification.persistence.entity.NotificationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationRepository extends JpaRepository<NotificationEntity, String> {
  List<NotificationEntity> findByMemberIdOrderByCreatedAtDesc(String memberId);
}
