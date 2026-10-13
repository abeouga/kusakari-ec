package jp.kusakari.ec.catalog.dto;

import jakarta.validation.constraints.*;
import java.util.List;

public record ProductRequest(
  @Positive long storeId,
  @NotBlank @Size(max = 50) String sku,
  @NotBlank @Size(max = 120) String name,
  @NotNull @Size(max = 120) String latinName,
  @NotBlank @Pattern(regexp = "庭木|草花|ハーブ|観葉植物|鉢・庭材|土・ケア用品") String category,
  @NotBlank @Size(max = 5000) String description,
  @NotNull @Size(max = 80) String sizeLabel,
  @NotNull @Size(max = 5000) String care,
  @Min(1) @Max(100000) int priceYen,
  @Min(0) @Max(10000) int stock,
  @NotBlank @Size(max = 250) @Pattern(regexp = "/images/[a-zA-Z0-9_.-]+|https://[^\\s]+") String imageUrl,
  @NotNull @Size(max = 30) String badge,
  @NotNull @Size(max = 100) String nurseryName,
  @NotNull @Size(max = 200) String nurseryAddress,
  @NotNull @Pattern(regexp = "未設定|日なた|半日陰|日陰") String sunlight,
  @NotNull @Size(max = 80) String useCase,
  @Min(1) @Max(3) int careLevel,
  @Min(-50) @Max(50) Integer minTemperatureC,
  boolean heatTolerant,
  boolean droughtTolerant,
  @Min(0) @Max(1000) Integer ageYears,
  @Min(1) @Max(3000) Integer heightCm,
  @Min(1) @Max(300) Integer potDiameterCm,
  @NotNull @Size(max = 100) String familyName,
  @NotNull @Size(max = 5000) String floweringDescription,
  @NotNull @Size(max = 5000) String seasonalCare,
  @NotNull @Size(max = 5000) String styleDescription,
  @NotNull
  @Size(max = 4)
  List<@NotBlank @Size(max = 2048) @Pattern(regexp = "/images/[a-zA-Z0-9_.-]+|https://[^\\s]+") String> images
) {}
