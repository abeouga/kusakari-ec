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
  private final com.fasterxml.jackson.databind.ObjectMapper mapper;

  public CanvasModelClient(
    @Qualifier("canvasClient") RestClient client,
    com.fasterxml.jackson.databind.ObjectMapper mapper
  ) {
    this.client = client;
    this.mapper = mapper;
  }

  public JsonNode resolve(PlantModelProfile profile) {
    try {
      JsonNode composition = client
        .post()
        .uri("/api/model-assemblies/resolve")
        .body(profile)
        .retrieve()
        .body(JsonNode.class);
      if (composition == null || !composition.path("parts").isArray() || composition.path("parts").isEmpty()) {
        throw new ApiException(502, "INVALID_MODEL_RESPONSE", "植物の構成結果を取得できませんでした。");
      }
      return composition;
    } catch (RestClientException error) {
      throw new ApiException(
        503,
        "MODEL_SERVICE_UNAVAILABLE",
        "植物モデルを確定できません。Canvasの起動を確認して再試行してください。"
      );
    }
  }

  public void checkSuggestion(PlantModelProfile profile) {
    try {
      JsonNode result = client
        .post()
        .uri("/api/model-assemblies/resolve")
        .body(profile)
        .retrieve()
        .body(JsonNode.class);
      if (result == null || !result.path("parts").isArray() || result.path("parts").isEmpty()) throw new ApiException(
        502,
        "AI_MODEL_INVALID",
        "AIの設定から3Dモデルを組み立てられませんでした。再試行または手動で設定してください。"
      );
    } catch (org.springframework.web.client.RestClientResponseException error) {
      if (error.getStatusCode().is4xxClientError()) {
        try {
          var detail = mapper.readTree(error.getResponseBodyAsString());
          if ("INCOMPATIBLE_PLANT_DIMENSIONS".equals(detail.path("code").asText())) throw new ApiException(
            422,
            "AI_MODEL_DIMENSIONS",
            "AIの葉・花・幹の寸法が植物全体に収まりません。再試行または手動で設定してください。"
          );
        } catch (com.fasterxml.jackson.core.JsonProcessingException ignored) {
          /* Use the generic validation error. */
        }
      }
      if (error.getStatusCode().is4xxClientError()) throw new ApiException(
        422,
        "AI_MODEL_INCOMPATIBLE",
        "AIの設定から3Dモデルを組み立てられませんでした。再試行または手動で設定してください。"
      );
      throw unavailable();
    } catch (RestClientException error) {
      throw unavailable();
    }
  }

  private static ApiException unavailable() {
    return new ApiException(
      503,
      "MODEL_SERVICE_UNAVAILABLE",
      "3Dモデルを確認できません。Canvasの起動を確認して再試行してください。"
    );
  }
}
