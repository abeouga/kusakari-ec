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
    String canvasMaterialCode,
    Long sellerStoreId,
    String sellerStoreName
  ) {}

  /**
   * Latitude and longitude place the store on the seller's in-page store map (issue #46).
   * 位置を登録していない店舗は、緯度・経度・距離が null。
   */
  public record StoreView(
    long id,
    String name,
    String address,
    String hours,
    Double latitude,
    Double longitude,
    Double distanceKm
  ) {}

  /**
   * 庭に置いた商品の参照。販売を終えた商品も返す（active = false）。
   * purchasable は、購入者に見えていて今カートに入れられるか。
   */
  public record ProductReferenceView(
    String id,
    String name,
    String imageUrl,
    boolean active,
    boolean hasPlantModel,
    Long storeId,
    String storeName,
    int stock,
    boolean purchasable
  ) {}

  public record ProductReferenceRequest(
    @NotEmpty @Size(max = 200) List<@NotBlank @Size(max = 40) String> productIds
  ) {}

  public record MaterialItem(
    @NotBlank @Size(max = 80) String materialCode,
    @Min(1) @Max(99) int quantity,
    @NotBlank @Pattern(regexp = "piece") String unit
  ) {}

  /** storeId が null なら、全店舗の商品から候補を出す。 */
  public record MaterialRequest(
    @Positive Long storeId,
    @NotEmpty @Size(max = 50) List<@NotNull @Valid MaterialItem> items
  ) {}

  public record Candidate(ProductView product, int purchaseQuantity, int lineTotalYen, boolean available) {}

  public record MaterialMatch(String materialCode, String status, List<Candidate> candidates) {}
}
