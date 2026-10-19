package jp.kusakari.ec.catalog.dto;

import jakarta.validation.constraints.*;
import java.util.List;

public record ProductStatusRequest(
  @Positive long storeId,
  @NotEmpty @Size(max = 25) List<@NotBlank @Size(max = 40) String> productIds,
  @NotNull @Pattern(regexp = "PUBLISHED|HIDDEN|DELETED") String status
) {}
