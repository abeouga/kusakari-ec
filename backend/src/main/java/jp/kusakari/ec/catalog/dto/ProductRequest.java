package jp.kusakari.ec.catalog.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

/** A bean allows older clients to omit the optional plantModelProfile field. */
@Getter
@Setter
public class ProductRequest {

  @NotNull
  @Positive
  private Long storeId;

  @NotBlank
  @Size(max = 50)
  private String sku;

  @NotBlank
  @Size(max = 120)
  private String name;

  @NotNull
  @Size(max = 120)
  private String latinName;

  @NotBlank
  @Size(max = 30)
  private String category;

  @NotBlank
  @Size(max = 5000)
  private String description;

  @NotNull
  @Size(max = 80)
  private String sizeLabel;

  @NotNull
  @Size(max = 5000)
  private String care;

  @NotNull
  @Min(1)
  @Max(100000)
  private Integer priceYen;

  @NotNull
  @Min(0)
  @Max(10000)
  private Integer stock;

  /**
   * Update only: the selected store's stock when the edit form opened. When omitted, the current stock
   * must equal {@code stock}; a stale form therefore cannot overwrite stock changed by orders (EC-S05 5b).
   */
  @Min(0)
  @Max(10000)
  private Integer expectedStock;

  @NotBlank
  @Size(max = 250)
  @Pattern(regexp = "/images/[a-zA-Z0-9_.-]+|/api/product-images/[a-f0-9-]{36}|https://[^\\s]+")
  private String imageUrl;

  @NotNull
  @Size(max = 30)
  private String badge;

  @NotNull
  @Size(max = 100)
  private String nurseryName;

  @NotNull
  @Size(max = 200)
  private String nurseryAddress;

  @NotNull
  @Pattern(regexp = "未設定|日なた|半日陰|日陰")
  private String sunlight;

  @NotNull
  @Size(max = 80)
  private String useCase;

  @NotNull
  @Min(1)
  @Max(3)
  private Integer careLevel;

  @Min(-50)
  @Max(50)
  private Integer minTemperatureC;

  @NotNull
  private Boolean heatTolerant;

  @NotNull
  private Boolean droughtTolerant;

  @Min(0)
  @Max(1000)
  private Integer ageYears;

  @Min(1)
  @Max(3000)
  private Integer heightCm;

  @Min(1)
  @Max(300)
  private Integer potDiameterCm;

  @NotNull
  @Size(max = 100)
  private String familyName;

  @NotNull
  @Size(max = 4)
  private List<@NotBlank @Size(max = 2048) @Pattern(
    regexp = "/images/[a-zA-Z0-9_.-]+|/api/product-images/[a-f0-9-]{36}|https://[^\\s]+"
  ) String> images;

  @Valid
  private PlantModelProfile plantModelProfile;

  @JsonIgnore
  private boolean plantModelProfileProvided;

  public void setPlantModelProfile(PlantModelProfile profile) {
    plantModelProfile = profile;
    plantModelProfileProvided = true;
  }
}
