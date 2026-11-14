package jp.kusakari.ec.store.persistence.repository;

import java.util.List;
import jp.kusakari.ec.store.persistence.entity.OrganizationModerationEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrganizationModerationEventRepository extends JpaRepository<OrganizationModerationEventEntity, Long> {
  List<OrganizationModerationEventEntity> findByOrganizationIdOrderByIdDesc(Long organizationId);
}
