package jp.kusakari.ec.catalog.service;

import jp.kusakari.ec.catalog.dto.PlantModelProfile;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Fits inferred detail sizes only. Whole-plant dimensions, architecture, and seed are never replaced. */
@Service
@RequiredArgsConstructor
public class PlantSuggestionFitter {

  private final CanvasModelClient models;

  public boolean fit(PlantModelProfile profile) {
    try {
      models.checkSuggestion(profile);
      return false;
    } catch (ApiException error) {
      if (!error.code().equals("AI_MODEL_DIMENSIONS")) throw error;
    }
    double leaf = profile.getLeafSizeCm();
    double flower = profile.getFlowerSizeCm();
    double trunk = profile.getTrunkThicknessCm();
    double span = Math.min(profile.getHeightCm(), profile.getWidthCm());
    // No additional OpenAI calls: bounded, deterministic assembly checks of the same inferred plant.
    for (double ratio : new double[] { 0.7, 0.45, 0.25 }) {
      profile.setLeafSizeCm(tenth(Math.max(2, Math.min(leaf * ratio, span * 0.4))));
      profile.setFlowerSizeCm(tenth(Math.max(0.3, Math.min(flower * ratio, span * 0.15))));
      profile.setTrunkThicknessCm(tenth(Math.max(0.2, Math.min(trunk * ratio, span * 0.08))));
      try {
        models.checkSuggestion(profile);
        return true;
      } catch (ApiException error) {
        if (!error.code().equals("AI_MODEL_DIMENSIONS")) throw error;
      }
    }
    throw new ApiException(
      422,
      "AI_MODEL_DIMENSIONS",
      "AIの推定寸法を3Dで組み立てられませんでした。入力は保持されています。写真や商品名を確認するか手動で設定してください。"
    );
  }

  private static double tenth(double value) {
    return Math.floor(value * 10 + 0.000001) / 10;
  }
}
