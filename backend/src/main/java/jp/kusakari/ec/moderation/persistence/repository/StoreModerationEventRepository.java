package jp.kusakari.ec.moderation.persistence.repository;

import java.util.Collection;
import java.util.List;
import jp.kusakari.ec.moderation.persistence.entity.ModerationAction;
import jp.kusakari.ec.moderation.persistence.entity.StoreModerationEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreModerationEventRepository extends JpaRepository<StoreModerationEventEntity, Long> {
  List<StoreModerationEventEntity> findByStoreIdOrderByIdDesc(Long storeId);

  /** 店舗の一覧で、各店舗が警告中かを求めるための行（新しい順）。 */
  List<StoreModerationEventEntity> findByStoreIdInAndEventTypeInOrderByIdDesc(
    Collection<Long> storeIds,
    Collection<ModerationAction> types
  );
}
