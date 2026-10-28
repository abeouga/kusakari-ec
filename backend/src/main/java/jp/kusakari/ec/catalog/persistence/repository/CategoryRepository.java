package jp.kusakari.ec.catalog.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.*;
import jp.kusakari.ec.catalog.persistence.entity.CategoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CategoryRepository extends JpaRepository<CategoryEntity, String> {
  List<CategoryEntity> findByDeletedAtIsNull();

  /** Taken by category edits and deletion so they serialize with product saves using the category. */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from CategoryEntity c where c.name = :name")
  Optional<CategoryEntity> lock(@Param("name") String name);

  /** Taken by product saves; a concurrent deletion waits and then sees the new product. */
  @Lock(LockModeType.PESSIMISTIC_READ)
  @Query("select c from CategoryEntity c where c.name = :name")
  Optional<CategoryEntity> share(@Param("name") String name);
}
