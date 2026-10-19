package jp.kusakari.ec.catalog.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import com.fasterxml.jackson.databind.JsonNode;

public final class CatalogDtos {

  private CatalogDtos() {}

  public record ProductView(
    String id,
    String sku,
    String name,
    String latinName,
    String category,
    String description,
    String sizeLabel,
    String care,
    int priceYen,
    String unit,
    String imageUrl,
    String badge,
    int stock,
    String source,
    String sourceUpdatedAt,
    String nurseryName,
    String nurseryAddress,
    String sunlight,
    String useCase,
    int careLevel,
    Integer minTemperatureC,
    boolean heatTolerant,
    boolean droughtTolerant,
    Integer ageYears,
    Integer heightCm,
    Integer potDiameterCm,
    String familyName,
    String publishedAt,
    boolean active,
    String publicationStatus,
    List<String> images,
    PlantModelProfile plantModelProfile,
    JsonNode modelComposition,
    String canvasMaterialCode
  ) {}

  public record StoreView(long id, String name, String address, String hours, Double distanceKm) {}

  public record ProductReferenceRequest(
    @NotEmpty @Size(max = 200) List<@NotBlank @Size(max = 40) String> productIds
  ) {}

  public record MaterialItem(
    @NotBlank @Size(max = 80) String materialCode,
    @Min(1) @Max(99) int quantity,
    @NotBlank @Pattern(regexp = "piece") String unit
  ) {}

  public record MaterialRequest(
    @Positive long storeId,
    @NotEmpty @Size(max = 50) List<@NotNull @Valid MaterialItem> items
  ) {}

  public record Candidate(ProductView product, int purchaseQuantity, int lineTotalYen, boolean available) {}

  public record MaterialMatch(String materialCode, String status, List<Candidate> candidates) {}
}
