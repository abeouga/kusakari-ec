package jp.kusakari.ec.catalog.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<ProductEntity, String> {
  @EntityGraph(attributePaths = "images")
  List<ProductEntity> findAllByOrderByIdAsc();

  boolean existsBySku(String sku);

  boolean existsBySkuAndIdNot(String sku, String id);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from ProductEntity p where p.id = :id")
  Optional<ProductEntity> findLocked(@Param("id") String id);
}
