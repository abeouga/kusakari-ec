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
    return RestClient.builder().baseUrl(url).requestFactory(factory).requestInterceptor((request, body, execution) -> {
      var context = org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
      if (context instanceof org.springframework.web.context.request.ServletRequestAttributes attributes) {
        var source = attributes.getRequest();
        if (source.getCookies() != null) {
          for (var cookie : source.getCookies()) if ("KUSAKARI_SESSION".equals(cookie.getName())) {
            request.getHeaders().set("Cookie", "KUSAKARI_SESSION=" + cookie.getValue());
          }
        }
        String csrf = source.getHeader("X-CSRF-TOKEN");
        if (csrf != null) request.getHeaders().set("X-CSRF-TOKEN", csrf);
      }
      return execution.execute(request, body);
    }).build();
  }
}
