package jp.kusakari.ec.catalog.persistence.repository;

import java.util.List;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreRepository extends JpaRepository<StoreEntity, Long> {
  List<StoreEntity> findAllByOrderByIdAsc();
}
