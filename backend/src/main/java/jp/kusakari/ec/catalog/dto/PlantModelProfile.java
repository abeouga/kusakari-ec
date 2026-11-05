package jp.kusakari.ec.catalog.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.*;
import lombok.Data;

/**
 * Seller-entered plant features. Canvas (plant assembly v5) is the authority for compatible combinations and geometry.
 * A bean keeps optional fields absent for existing JSON clients and stored profiles.
 */
@Data
public class PlantModelProfile {
  @Pattern(regexp = "maple|monstera|iberis|hakone|goldcrest|olive|lavender|rose|hydrangea|boxwood|hosta") private String botanicalForm;
  @NotNull @Pattern(regexp = "tree|shrub|flower|conifer|multistem|spreading|grass|rosette|vine|palm") private String plantType;
  @NotNull @DecimalMin("10") @DecimalMax("1500") private Double heightCm;
  @NotNull @DecimalMin("10") @DecimalMax("1000") private Double widthCm;
  @NotNull @Pattern(regexp = "round|conical|spreading") private String crownShape;
  @NotNull @Min(3) @Max(24) private Integer branchCount;
  @NotNull @DecimalMin("15") @DecimalMax("80") private Double branchAngle;
  @NotNull @DecimalMin("0.2") @DecimalMax("100") private Double trunkThicknessCm;
  @NotNull @Pattern(regexp = "oval|narrow|needle|scale|round|heart|palmate|split|compound|succulent|grass|frond") private String leafShape;
  @NotNull @DecimalMin("0.5") @DecimalMax("200") private Double leafSizeCm;
  @NotNull @Pattern(regexp = "sparse|low|medium|high|dense") private String leafDensity;
  @NotNull @Pattern(regexp = "#[0-9a-fA-F]{6}") private String leafColor;
  @NotNull private Boolean flowerEnabled;
  @NotNull @Pattern(regexp = "four|five|eight|spike|cluster|daisy|bell|plume") private String flowerShape;
  @NotNull @DecimalMin("0.3") @DecimalMax("60") private Double flowerSizeCm;
  @NotNull @Pattern(regexp = "#[0-9a-fA-F]{6}") private String flowerColor;
  @NotNull @Min(0) private Integer seed;

  // Shape controls. Null means "automatic": Canvas uses the plant type / species value.
  // Omitted from JSON when null, so profiles saved before these controls existed are stored and returned unchanged.
  @JsonInclude(JsonInclude.Include.NON_NULL) @Min(1) @Max(12) private Integer stemCount;
  @JsonInclude(JsonInclude.Include.NON_NULL) @DecimalMin("0") @DecimalMax("1") private Double stemCurve;
  @JsonInclude(JsonInclude.Include.NON_NULL) @DecimalMin("0") @DecimalMax("1") private Double stemTaper;
  @JsonInclude(JsonInclude.Include.NON_NULL) @DecimalMin("0.3") @DecimalMax("1.5") private Double twigLength;
  @JsonInclude(JsonInclude.Include.NON_NULL) @Min(1) @Max(3) private Integer branchLevels;
  @JsonInclude(JsonInclude.Include.NON_NULL) @DecimalMin("0") @DecimalMax("1") private Double branchDroop;
  @JsonInclude(JsonInclude.Include.NON_NULL) @DecimalMin("0.05") @DecimalMax("0.9") private Double branchStart;
  @JsonInclude(JsonInclude.Include.NON_NULL) @DecimalMin("0") @DecimalMax("0.5") private Double leafSizeVariation;
  @JsonInclude(JsonInclude.Include.NON_NULL) @DecimalMin("0.4") @DecimalMax("1.6") private Double leafTipRatio;
  @JsonInclude(JsonInclude.Include.NON_NULL) @Pattern(regexp = "alternate|opposite|whorled") private String leafArrangement;
}
