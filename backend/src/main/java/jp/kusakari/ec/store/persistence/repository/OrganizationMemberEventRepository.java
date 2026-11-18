package jp.kusakari.ec.store.persistence.repository;

import java.util.Collection;
import java.util.List;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrganizationMemberEventRepository extends JpaRepository<OrganizationMemberEventEntity, Long> {
  /** 組織からの除名と復帰の記録（#180）。 */
  List<OrganizationMemberEventEntity> findByOrganizationIdAndEventTypeInOrderByIdDesc(
    Long organizationId,
    Collection<String> eventTypes
  );

  /** その店舗の担当にした・外した記録（#180）。 */
  List<OrganizationMemberEventEntity> findByOrganizationIdAndStoreIdOrderByIdDesc(Long organizationId, Long storeId);
}
