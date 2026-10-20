package jp.kusakari.ec.catalog.persistence.repository;

import java.util.*;
import jp.kusakari.ec.catalog.persistence.entity.CategoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRepository extends JpaRepository<CategoryEntity, String> {}
