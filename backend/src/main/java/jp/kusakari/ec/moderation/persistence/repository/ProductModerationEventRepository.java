package jp.kusakari.ec.moderation.persistence.repository;

import java.util.Collection;
import java.util.List;
import jp.kusakari.ec.moderation.persistence.entity.ModerationAction;
import jp.kusakari.ec.moderation.persistence.entity.ProductModerationEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductModerationEventRepository extends JpaRepository<ProductModerationEventEntity, Long> {
  List<ProductModerationEventEntity> findByProductIdOrderByIdDesc(String productId);

  /** 運営の商品一覧で、各商品が警告中かを求めるための行（警告と警告解除だけ、新しい順）。 */
  List<ProductModerationEventEntity> findByEventTypeInOrderByIdDesc(Collection<ModerationAction> types);

  /** 出店者の商品一覧で、店舗の商品が警告中かを求めるための行（新しい順）。 */
  @Query(
    "select e from ProductModerationEventEntity e where e.eventType in :types and e.productId in " +
      "(select p.id from ProductEntity p where p.storeId = :storeId) order by e.id desc"
  )
  List<ProductModerationEventEntity> findAtStore(
    @Param("storeId") long storeId,
    @Param("types") Collection<ModerationAction> types
  );
}
