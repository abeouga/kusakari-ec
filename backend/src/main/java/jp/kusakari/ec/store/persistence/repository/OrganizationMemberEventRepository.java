package jp.kusakari.ec.store.persistence.repository;

import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrganizationMemberEventRepository extends JpaRepository<OrganizationMemberEventEntity, Long> {}
