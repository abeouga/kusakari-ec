package jp.kusakari.ec.catalog.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public record PlantSuggestionRequest(
  @NotBlank @Size(max = 120) String name,
  @NotNull @Size(max = 120) String latinName,
  @NotNull @Size(max = 30) String category,
  @NotNull @Size(max = 5000) String description,
  @Min(10) @Max(1500) Integer heightCm,
  @Valid PlantModelProfile currentProfile,
  @Size(max = 2048) String imageUrl,
  @Size(max = 7000000) String imageDataUrl
) {}
