package jp.kusakari.ec.commerce.persistence.repository;

import jp.kusakari.ec.commerce.persistence.entity.CartDetailsEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CartDetailsRepository extends JpaRepository<CartDetailsEntity, String> {}
