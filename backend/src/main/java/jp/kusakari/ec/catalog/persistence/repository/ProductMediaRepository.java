package jp.kusakari.ec.catalog.persistence.repository;

import jp.kusakari.ec.catalog.persistence.entity.ProductMediaEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductMediaRepository extends JpaRepository<ProductMediaEntity, String> {}
