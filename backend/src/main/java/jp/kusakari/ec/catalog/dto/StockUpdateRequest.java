package jp.kusakari.ec.catalog.dto;

import jakarta.validation.constraints.*;

/** EC-S05: expectedStock is the quantity the seller saw; the update is rejected if it has changed since. */
public record StockUpdateRequest(
  @NotNull @Positive Long storeId,
  @NotNull @Min(0) @Max(10000) Integer expectedStock,
  @NotNull @Min(0) @Max(10000) Integer stock
) {}
