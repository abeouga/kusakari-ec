package jp.kusakari.ec.catalog.mapper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.dto.ProductRequest;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.Named;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface ProductMapper {
  @Mapping(target = "stock", source = "stock")
  @Mapping(target = "modelComposition", source = "product.modelComposition", qualifiedByName = "compositionView")
  @Mapping(
    target = "active",
    expression = "java(product.isActive() && !product.isSuspended() && publicationStatus.equals(\"PUBLISHED\"))"
  )
  @Mapping(target = "publicationStatus", expression = "java(product.isActive() ? publicationStatus : \"DELETED\")")
  ProductView toView(ProductEntity product, int stock, String publicationStatus);

  // Seller forms edit the profile, not the generated geometry. Avoid sending large meshes in list responses.
  @Mapping(target = "modelComposition", ignore = true)
  ProductView toSellerView(ProductView product);

  @Named("compositionView")
  default JsonNode compositionView(JsonNode source) {
    if (
      source instanceof ObjectNode model &&
      model.get("profile") instanceof ObjectNode profile &&
      !profile.has("botanicalForm")
    ) {
      // Response-only default for old manifests; never mutate Hibernate-managed JSON or regenerate geometry.
      ObjectNode view = model.objectNode().setAll(model);
      ObjectNode profileView = profile.deepCopy();
      profileView.putNull("botanicalForm");
      view.set("profile", profileView);
      return view;
    }
    return source;
  }

  @Mapping(target = "care", ignore = true)
  @Mapping(target = "minTemperatureC", ignore = true)
  @Mapping(target = "sunlight", ignore = true)
  @Mapping(target = "careLevel", ignore = true)
  @Mapping(target = "heatTolerant", ignore = true)
  @Mapping(target = "droughtTolerant", ignore = true)
  @Mapping(target = "useCase", ignore = true)
  @Mapping(target = "id", ignore = true)
  @Mapping(target = "unit", ignore = true)
  @Mapping(target = "source", ignore = true)
  @Mapping(target = "sourceProductId", ignore = true)
  @Mapping(target = "sourceUpdatedAt", ignore = true)
  @Mapping(target = "publishedAt", ignore = true)
  @Mapping(target = "active", ignore = true)
  ProductEntity toEntity(ProductRequest input);

  @Mapping(target = "care", ignore = true)
  @Mapping(target = "minTemperatureC", ignore = true)
  @Mapping(target = "sunlight", ignore = true)
  @Mapping(target = "careLevel", ignore = true)
  @Mapping(target = "heatTolerant", ignore = true)
  @Mapping(target = "droughtTolerant", ignore = true)
  @Mapping(target = "useCase", ignore = true)
  @Mapping(target = "id", ignore = true)
  @Mapping(target = "unit", ignore = true)
  @Mapping(target = "source", ignore = true)
  @Mapping(target = "sourceProductId", ignore = true)
  @Mapping(target = "sourceUpdatedAt", ignore = true)
  @Mapping(target = "publishedAt", ignore = true)
  @Mapping(target = "active", ignore = true)
  void updateEntity(ProductRequest input, @MappingTarget ProductEntity product);
}
