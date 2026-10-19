package jp.kusakari.ec.catalog.persistence.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jp.kusakari.ec.catalog.dto.PlantModelProfile;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "products")
@Getter
@Setter
@NoArgsConstructor
public class ProductEntity {

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "plant_model_profile", columnDefinition = "json")
  private PlantModelProfile plantModelProfile;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "model_composition", columnDefinition = "json")
  private JsonNode modelComposition;

  public String getCanvasMaterialCode() {
    return modelComposition == null ? null : "product." + id;
  }

  @Id
  @Column(length = 40)
  private String id;

  @Column(nullable = false, length = 50)
  private String sku;

  @Column(nullable = false, length = 120)
  private String name;

  @Column(name = "latin_name", nullable = false, length = 120)
  private String latinName;

  @Column(nullable = false, length = 30)
  private String category;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String description;

  @Column(name = "size_label", nullable = false, length = 80)
  private String sizeLabel;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String care;

  @Column(name = "price_yen", nullable = false)
  private int priceYen;

  @Column(nullable = false, length = 20)
  private String unit = "piece";

  @Column(name = "image_url", nullable = false, length = 250)
  private String imageUrl;

  @Column(nullable = false, length = 30)
  private String badge;

  @Column(nullable = false, length = 30)
  private String source = "demo";

  @Column(name = "source_product_id", length = 120)
  private String sourceProductId;

  @Column(name = "source_updated_at", nullable = false)
  private Instant sourceUpdatedAt = Instant.now();

  @Column(name = "nursery_name", nullable = false, length = 100)
  private String nurseryName = "";

  @Column(name = "nursery_address", nullable = false, length = 200)
  private String nurseryAddress = "";

  @Column(nullable = false, length = 30)
  private String sunlight = "未設定";

  @Column(name = "use_case", nullable = false, length = 80)
  private String useCase = "";

  @Column(name = "care_level", nullable = false)
  private int careLevel = 1;

  @Column(name = "min_temperature_c")
  private Integer minTemperatureC;

  @Column(name = "heat_tolerant", nullable = false)
  private boolean heatTolerant;

  @Column(name = "drought_tolerant", nullable = false)
  private boolean droughtTolerant;

  @Column(name = "age_years")
  private Integer ageYears;

  @Column(name = "height_cm")
  private Integer heightCm;

  @Column(name = "pot_diameter_cm")
  private Integer potDiameterCm;

  @Column(name = "family_name", nullable = false, length = 100)
  private String familyName = "";

  @Column(name = "flowering_description", columnDefinition = "TEXT")
  private String floweringDescription = "";

  @Column(name = "seasonal_care", columnDefinition = "TEXT")
  private String seasonalCare = "";

  @Column(name = "style_description", columnDefinition = "TEXT")
  private String styleDescription = "";

  @Column(name = "published_at", nullable = false)
  private Instant publishedAt = Instant.now();

  @Column(nullable = false)
  private boolean active = true;

  @ElementCollection(fetch = FetchType.LAZY)
  @CollectionTable(name = "product_images", joinColumns = @JoinColumn(name = "product_id"))
  @Column(name = "image_url", nullable = false, length = 2048)
  @OrderColumn(name = "sort_order")
  private List<String> images = new ArrayList<>();
}
