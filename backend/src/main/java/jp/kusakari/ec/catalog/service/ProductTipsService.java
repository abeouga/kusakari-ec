package jp.kusakari.ec.catalog.service;

import jp.kusakari.ec.catalog.dto.ProductTips;
import jp.kusakari.ec.catalog.persistence.entity.ProductEntity;
import jp.kusakari.ec.catalog.persistence.repository.ProductRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProductTipsService {

  private final ProductRepository products;

  @Transactional(readOnly = true)
  public ProductTips get(String id) {
    return view(products.findById(id).orElseThrow(this::missing));
  }

  @Transactional
  public ProductTips update(String id, ProductTips input) {
    var p = products.findLocked(id).orElseThrow(this::missing);
    if (!p.isActive()) throw new ApiException(409, "PRODUCT_ARCHIVED", "削除済みの商品にはTipsを追加できません。");
    p.setCare(input.care());
    p.setSeasonalCare(input.seasonalCare());
    p.setStyleDescription(input.styleDescription());
    p.setMinTemperatureC(input.minTemperatureC());
    p.setSunlight(input.sunlight());
    p.setCareLevel(input.careLevel());
    p.setHeatTolerant(input.heatTolerant());
    p.setDroughtTolerant(input.droughtTolerant());
    p.setUseCase(input.useCase());
    p.setFloweringDescription(input.floweringDescription());
    return view(p);
  }

  private ProductTips view(ProductEntity p) {
    return new ProductTips(
      p.getCare(),
      p.getSeasonalCare() == null ? "" : p.getSeasonalCare(),
      p.getStyleDescription() == null ? "" : p.getStyleDescription(),
      p.getMinTemperatureC(),
      p.getSunlight(),
      p.getCareLevel(),
      p.isHeatTolerant(),
      p.isDroughtTolerant(),
      p.getUseCase(),
      p.getFloweringDescription() == null ? "" : p.getFloweringDescription()
    );
  }

  private ApiException missing() {
    return new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。");
  }
}
