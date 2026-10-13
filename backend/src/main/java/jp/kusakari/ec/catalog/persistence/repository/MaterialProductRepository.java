package jp.kusakari.ec.catalog.persistence.repository;

import java.util.Collection;
import java.util.List;
import jp.kusakari.ec.catalog.persistence.entity.MaterialProductEntity;
import jp.kusakari.ec.catalog.persistence.entity.MaterialProductId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MaterialProductRepository extends JpaRepository<MaterialProductEntity, MaterialProductId> {
  @Query("select m from MaterialProductEntity m where m.id.materialCode in :codes")
  List<MaterialProductEntity> findAllForCodes(@Param("codes") Collection<String> codes);
}
