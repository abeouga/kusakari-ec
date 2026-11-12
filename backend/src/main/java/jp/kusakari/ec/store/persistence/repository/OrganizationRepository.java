package jp.kusakari.ec.store.persistence.repository;

import java.util.Optional;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrganizationRepository extends JpaRepository<OrganizationEntity, Long> {
  Optional<OrganizationEntity> findByOwnerMemberId(String ownerMemberId);
}
