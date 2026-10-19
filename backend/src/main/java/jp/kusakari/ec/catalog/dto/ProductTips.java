package jp.kusakari.ec.catalog.dto;

import jakarta.validation.constraints.*;

public record ProductTips(
  @NotNull @Size(max = 5000) String care,
  @NotNull @Size(max = 5000) String seasonalCare,
  @NotNull @Size(max = 5000) String styleDescription,
  @Min(-50) @Max(50) Integer minTemperatureC,
  @NotNull @Pattern(regexp = "未設定|日なた|半日陰|日陰") String sunlight,
  @Min(1) @Max(3) int careLevel,
  boolean heatTolerant,
  boolean droughtTolerant,
  @NotNull @Size(max = 80) String useCase,
  @NotNull @Size(max = 5000) String floweringDescription
) {}
