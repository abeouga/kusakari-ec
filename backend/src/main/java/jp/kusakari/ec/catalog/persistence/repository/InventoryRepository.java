package jp.kusakari.ec.catalog.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import jp.kusakari.ec.catalog.persistence.entity.InventoryId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InventoryRepository extends JpaRepository<InventoryEntity, InventoryId> {
  @Query("select i from InventoryEntity i where i.id.storeId = :storeId")
  List<InventoryEntity> findAllAtStore(@Param("storeId") long storeId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select i from InventoryEntity i where i.id.storeId = :storeId and i.id.productId = :productId")
  Optional<InventoryEntity> lockAtStore(@Param("storeId") long storeId, @Param("productId") String productId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query(
    "select i from InventoryEntity i where i.id.storeId = :storeId " +
      "and i.id.productId in :productIds order by i.id.productId"
  )
  List<InventoryEntity> lockAllAtStore(
    @Param("storeId") long storeId,
    @Param("productIds") Collection<String> productIds
  );
}
