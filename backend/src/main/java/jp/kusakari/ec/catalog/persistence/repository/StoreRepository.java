package jp.kusakari.ec.catalog.persistence.repository;

import java.util.List;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreRepository extends JpaRepository<StoreEntity, Long> {
  @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
  @org.springframework.data.jpa.repository.Query("select s from StoreEntity s where s.id=:id")
  java.util.Optional<StoreEntity> lock(@org.springframework.data.repository.query.Param("id") Long id);

  List<StoreEntity> findAllByOrderByIdAsc();
}
