package jp.kusakari.ec.catalog.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.catalog.dto.ProductImageReference;
import jp.kusakari.ec.catalog.dto.ProductStoreReference;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<ProductEntity, String> {
  boolean existsByCategory(String category);

  // 削除された商品（在庫の公開状態が DELETED）は、カテゴリーを使っている商品に数えない。
  @Query(
    "select case when count(p) > 0 then true else false end from ProductEntity p " +
      "where p.category = :category and not exists " +
      "(select i.quantity from InventoryEntity i where i.productId = p.id and i.publicationStatus = 'DELETED')"
  )
  boolean isCategoryInUse(@Param("category") String category);

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

  // 削除された商品は一覧に出さないので、大きな 3D モデルの JSON を読み込まない。
  @EntityGraph(attributePaths = "images")
  @Query(
    "select p from ProductEntity p where not exists " +
      "(select i.quantity from InventoryEntity i where i.productId = p.id and i.publicationStatus = 'DELETED')"
  )
  List<ProductEntity> findAllNotDeleted();

  @EntityGraph(attributePaths = "images")
  @Query(
    "select p from ProductEntity p where p.storeId = :storeId and not exists " +
      "(select i.quantity from InventoryEntity i where i.productId = p.id and i.publicationStatus = 'DELETED')"
  )
  List<ProductEntity> findNotDeletedAtStore(@Param("storeId") long storeId);

  // Avoid loading multi-megabyte manifests just to retrieve image metadata.
  @Query(
    "select new jp.kusakari.ec.catalog.dto.ProductImageReference(p.id, p.name, p.imageUrl, " +
      "case when exists (select i.quantity from InventoryEntity i where i.productId = p.id " +
      "and i.publicationStatus = 'DELETED') then false else true end, " +
      "case when p.modelComposition is not null then true else false end) from ProductEntity p where p.id in :ids"
  )
  List<ProductImageReference> findImageReferences(@Param("ids") Collection<String> ids);

  // 商品がどの店舗のものかを確かめるだけのときに、大きな 3D モデルの JSON を読み込まない。
  @Query(
    "select new jp.kusakari.ec.catalog.dto.ProductStoreReference(p.id, p.storeId, p.suspended) " +
      "from ProductEntity p where p.id in :ids"
  )
  List<ProductStoreReference> findStoreReferences(@Param("ids") Collection<String> ids);

  boolean existsByStoreIdAndSku(Long storeId, String sku);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from ProductEntity p where p.id = :id")
  Optional<ProductEntity> findLocked(@Param("id") String id);

}
