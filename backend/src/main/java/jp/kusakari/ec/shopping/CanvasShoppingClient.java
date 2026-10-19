package jp.kusakari.ec.shopping;

import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.shopping.ShoppingDtos.*;

@Service
public class CanvasShoppingClient {
  private final RestClient client;
  public CanvasShoppingClient(@Qualifier("canvasClient") RestClient client) {
    this.client = client;
  }
  public List<Summary> summaries() {
    try {
      var result = client.get().uri("/api/shopping-lists").retrieve()
        .body(new ParameterizedTypeReference<List<Summary>>() {});
      if (result == null) throw unavailable();
      return result;
    } catch (RestClientException error) { throw unavailable(); }
  }
  public SourceList detail(String id) {
    try {
      var result = client.get().uri("/api/gardens/{id}/shopping-list", id).retrieve().body(SourceList.class);
      if (result == null) throw unavailable();
      return result;
    } catch (RestClientResponseException error) {
      if (error.getStatusCode().value() == 404) throw new ApiException(404, "GARDEN_NOT_FOUND", "庭が見つかりません。");
      throw unavailable();
    } catch (RestClientException error) { throw unavailable(); }
  }
  public byte[] thumbnail(String id) {
    try {
      var result = client.get().uri("/api/gardens/{id}/thumbnail", id).retrieve().body(byte[].class);
      if (result == null) throw unavailable();
      return result;
    } catch (RestClientResponseException error) {
      if (error.getStatusCode().value() == 404) throw new ApiException(404, "GARDEN_NOT_FOUND", "庭が見つかりません。");
      throw unavailable();
    } catch (RestClientException error) { throw unavailable(); }
  }
  private ApiException unavailable() {
    return new ApiException(503, "SHOPPING_LIST_UNAVAILABLE", "庭の買い物リストを取得できません。接続を確認して再試行してください。");
  }
}
