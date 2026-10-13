package jp.kusakari.ec.catalog.mapper;

import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.dto.ProductRequest;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface ProductMapper {
  @Mapping(target = "stock", source = "stock")
  ProductView toView(ProductEntity product, int stock);

  @Mapping(target = "id", ignore = true)
  @Mapping(target = "unit", ignore = true)
  @Mapping(target = "source", ignore = true)
  @Mapping(target = "sourceProductId", ignore = true)
  @Mapping(target = "sourceUpdatedAt", ignore = true)
  @Mapping(target = "publishedAt", ignore = true)
  @Mapping(target = "active", ignore = true)
  ProductEntity toEntity(ProductRequest input);

  @Mapping(target = "id", ignore = true)
  @Mapping(target = "unit", ignore = true)
  @Mapping(target = "source", ignore = true)
  @Mapping(target = "sourceProductId", ignore = true)
  @Mapping(target = "sourceUpdatedAt", ignore = true)
  @Mapping(target = "publishedAt", ignore = true)
  @Mapping(target = "active", ignore = true)
  void updateEntity(ProductRequest input, @MappingTarget ProductEntity product);
}
