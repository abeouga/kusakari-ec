package jp.kusakari.ec.member.persistence.repository;

import jp.kusakari.ec.member.persistence.entity.PickupContactEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PickupContactRepository extends JpaRepository<PickupContactEntity, String> {}
