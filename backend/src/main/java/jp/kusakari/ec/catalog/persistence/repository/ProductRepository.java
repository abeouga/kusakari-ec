package jp.kusakari.ec.catalog.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.catalog.dto.ProductImageReference;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<ProductEntity, String> {
  boolean existsByCategory(String category);

  @org.springframework.data.jpa.repository.Modifying
  @org.springframework.data.jpa.repository.Query(
    "update ProductEntity p set p.category=:next where p.category=:previous"
  )
  void renameCategory(
    @org.springframework.data.repository.query.Param("previous") String previous,
    @org.springframework.data.repository.query.Param("next") String next
  );

  @EntityGraph(attributePaths = "images")
  @Override
  List<ProductEntity> findAll();

  @EntityGraph(attributePaths = "images")
  List<ProductEntity> findByIdIn(Collection<String> ids);

  // Avoid loading multi-megabyte manifests just to retrieve image metadata.
  @Query(
    "select new jp.kusakari.ec.catalog.dto.ProductImageReference(p.id, p.name, p.imageUrl, p.active, " +
      "case when p.modelComposition is not null then true else false end) from ProductEntity p where p.id in :ids"
  )
  List<ProductImageReference> findImageReferences(@Param("ids") Collection<String> ids);

  boolean existsBySku(String sku);

  boolean existsBySkuAndIdNot(String sku, String id);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from ProductEntity p where p.id = :id")
  Optional<ProductEntity> findLocked(@Param("id") String id);

  // Do not deserialize/rewrite legacy JSON when changing only catalog visibility.
  @Modifying
  @Query("update ProductEntity p set p.active = false where p.id = :id")
  int archiveById(@Param("id") String id);
}
