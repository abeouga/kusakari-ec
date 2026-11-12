package jp.kusakari.ec.catalog.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InventoryRepository extends JpaRepository<InventoryEntity, String> {
  // 在庫は商品と1対1なので、店舗の在庫は商品の店舗から求める。
  @Query(
    "select i from InventoryEntity i where i.productId in " +
      "(select p.id from ProductEntity p where p.storeId = :storeId)"
  )
  List<InventoryEntity> findAllAtStore(@Param("storeId") long storeId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select i from InventoryEntity i where i.productId = :productId")
  Optional<InventoryEntity> lock(@Param("productId") String productId);

  // 複数の商品をロックするときは、商品 ID の昇順で取り、デッドロックを避ける。
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select i from InventoryEntity i where i.productId in :productIds order by i.productId")
  List<InventoryEntity> lockAll(@Param("productIds") Collection<String> productIds);
}
