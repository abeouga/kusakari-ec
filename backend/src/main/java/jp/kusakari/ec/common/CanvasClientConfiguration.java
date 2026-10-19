package jp.kusakari.ec.common;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class CanvasClientConfiguration {
  @Bean("canvasClient")
  public RestClient canvasClient(@Value("${kusakari.ec.canvas-api-url}") String url) {
    var http = java.net.http.HttpClient.newBuilder().version(java.net.http.HttpClient.Version.HTTP_1_1)
      .connectTimeout(Duration.ofSeconds(3)).build();
    var factory = new JdkClientHttpRequestFactory(http);
    factory.setReadTimeout(Duration.ofSeconds(10));
    return RestClient.builder().baseUrl(url).requestFactory(factory).build();
  }
}
