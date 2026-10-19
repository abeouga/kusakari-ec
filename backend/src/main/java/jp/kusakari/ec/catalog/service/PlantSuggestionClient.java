package jp.kusakari.ec.catalog.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import jp.kusakari.ec.common.web.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Service
public class PlantSuggestionClient {

  private final RestClient client;
  private final String key;
  private final String model;
  private final ObjectMapper mapper;

  public PlantSuggestionClient(
    ObjectMapper mapper,
    @Value("${kusakari.ec.openai-api-key:}") String key,
    @Value("${kusakari.ec.plant-suggestion-model:gpt-6-luna}") String model
  ) {
    this.mapper = mapper;
    this.key = key;
    this.model = model;
    var http = java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    var factory = new JdkClientHttpRequestFactory(http);
    factory.setReadTimeout(Duration.ofSeconds(90));
    this.client = RestClient.builder().baseUrl("https://api.openai.com/v1").requestFactory(factory).build();
  }

  public JsonNode infer(String instructions, String text, String image) {
    if (key.isBlank()) throw new ApiException(
      503,
      "AI_NOT_CONFIGURED",
      "AI設定用のAPIキーが未設定です。手動入力は利用できます。"
    );
    var content = new java.util.ArrayList<Map<String, Object>>();
    content.add(Map.of("type", "input_text", "text", text));
    if (image != null) content.add(Map.of("type", "input_image", "image_url", image));
    var body = Map.of(
      "model",
      model,
      "store",
      false,
      "instructions",
      instructions,
      "reasoning",
      Map.of("effort", "low"),
      "max_output_tokens",
      4000,
      "input",
      List.of(Map.of("role", "user", "content", content)),
      "text",
      Map.of(
        "format",
        Map.of(
          "type",
          "json_schema",
          "name",
          "plant_features",
          "strict",
          true,
          "schema",
          PlantSuggestionSchema.create(mapper)
        )
      )
    );
    try {
      JsonNode result = client
        .post()
        .uri("/responses")
        .header("Authorization", "Bearer " + key)
        .body(body)
        .retrieve()
        .body(JsonNode.class);
      if (result == null || !"completed".equals(result.path("status").asText())) throw invalid();
      for (JsonNode message : result.path("output")) {
        for (JsonNode item : message.path("content")) {
          if ("refusal".equals(item.path("type").asText())) throw new ApiException(
            422,
            "AI_REFUSED",
            "この情報では特徴を推定できません。商品名や写真を確認してください。"
          );
          if ("output_text".equals(item.path("type").asText())) return mapper.readTree(item.path("text").asText());
        }
      }
      throw invalid();
    } catch (RestClientResponseException error) {
      if (error.getStatusCode().value() == 429) throw new ApiException(
        429,
        "AI_RATE_LIMITED",
        "AIの利用上限に達しました。時間をおいて再試行してください。"
      );
      if (error.getStatusCode().value() == 401 || error.getStatusCode().value() == 403) throw new ApiException(
        503,
        "AI_AUTHENTICATION_FAILED",
        "AIの認証設定またはモデルの利用権限を確認してください。"
      );
      throw new ApiException(
        502,
        "AI_SERVICE_ERROR",
        "AIから結果を取得できませんでした。写真・モデル設定を確認して再試行してください。"
      );
    } catch (ResourceAccessException error) {
      throw new ApiException(
        504,
        "AI_TIMEOUT",
        "AIとの通信を完了できませんでした。入力は保持されています。再試行してください。"
      );
    } catch (RestClientException | java.io.IOException error) {
      throw invalid();
    }
  }

  private static ApiException invalid() {
    return new ApiException(502, "AI_INVALID_RESPONSE", "AIの推定結果を読み取れませんでした。入力は保持されています。");
  }
}
