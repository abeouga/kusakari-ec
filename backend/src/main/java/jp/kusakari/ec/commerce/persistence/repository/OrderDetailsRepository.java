package jp.kusakari.ec.commerce.persistence.repository;

import jp.kusakari.ec.commerce.persistence.entity.OrderDetailsEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderDetailsRepository extends JpaRepository<OrderDetailsEntity, String> {}
