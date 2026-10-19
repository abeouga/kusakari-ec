package jp.kusakari.ec.catalog.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

/** A bean keeps the new botanicalForm optional for existing JSON clients and stored profiles. */
@Data
public class PlantModelProfile {
  @Pattern(regexp = "maple|monstera|iberis|hakone|goldcrest") private String botanicalForm;
  @NotNull @Pattern(regexp = "tree|shrub|flower|conifer|multistem|spreading|grass|rosette|vine|palm") private String plantType;
  @NotNull @DecimalMin("10") @DecimalMax("1500") private Double heightCm;
  @NotNull @DecimalMin("10") @DecimalMax("1000") private Double widthCm;
  @NotNull @Pattern(regexp = "round|conical|spreading") private String crownShape;
  @NotNull @Min(3) @Max(24) private Integer branchCount;
  @NotNull @DecimalMin("15") @DecimalMax("80") private Double branchAngle;
  @NotNull @DecimalMin("0.2") @DecimalMax("100") private Double trunkThicknessCm;
  @NotNull @Pattern(regexp = "oval|narrow|needle|scale|round|heart|palmate|split|compound|succulent|grass|frond") private String leafShape;
  @NotNull @DecimalMin("2") @DecimalMax("80") private Double leafSizeCm;
  @NotNull @Pattern(regexp = "low|medium|high") private String leafDensity;
  @NotNull @Pattern(regexp = "#[0-9a-fA-F]{6}") private String leafColor;
  @NotNull private Boolean flowerEnabled;
  @NotNull @Pattern(regexp = "four|five|eight|spike|cluster|daisy|bell|plume") private String flowerShape;
  @NotNull @DecimalMin("0.3") @DecimalMax("60") private Double flowerSizeCm;
  @NotNull @Pattern(regexp = "#[0-9a-fA-F]{6}") private String flowerColor;
  @NotNull @Min(0) private Integer seed;
}
