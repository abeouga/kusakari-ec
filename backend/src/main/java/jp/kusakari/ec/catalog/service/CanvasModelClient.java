package jp.kusakari.ec.catalog.service;

import com.fasterxml.jackson.databind.JsonNode;
import jp.kusakari.ec.catalog.dto.PlantModelProfile;
import jp.kusakari.ec.common.web.ApiException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Service
public class CanvasModelClient {
  private final RestClient client;

  public CanvasModelClient(@Qualifier("canvasClient") RestClient client) {
    this.client = client;
  }

  public JsonNode resolve(PlantModelProfile profile) {
    try {
      JsonNode composition = client.post().uri("/api/model-assemblies/resolve")
        .body(profile).retrieve().body(JsonNode.class);
      if (composition == null || !composition.path("parts").isArray() || composition.path("parts").isEmpty()) {
        throw new ApiException(502, "INVALID_MODEL_RESPONSE", "植物の構成結果を取得できませんでした。");
      }
      return composition;
    } catch (RestClientException error) {
      throw new ApiException(503, "MODEL_SERVICE_UNAVAILABLE", "植物モデルを確定できません。Canvasの起動を確認して再試行してください。");
    }
  }
}
