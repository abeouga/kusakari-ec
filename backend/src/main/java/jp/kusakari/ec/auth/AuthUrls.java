package jp.kusakari.ec.auth;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AuthUrls {

  private final String origin;
  private final String canvasOrigin;
  private final String domain;
  private final String clientId;

  public AuthUrls(
    @Value("${kusakari.ec.web-origin}") String origin,
    @Value("${kusakari.ec.canvas-origin}") String canvasOrigin,
    @Value("${KUSAKARI_COGNITO_DOMAIN:}") String domain,
    @Value("${KUSAKARI_COGNITO_CLIENT_ID:}") String clientId
  ) {
    this.origin = origin;
    this.canvasOrigin = canvasOrigin;
    this.domain = domain;
    this.clientId = clientId;
  }

  public String webOrigin() {
    return origin;
  }

  public String safeReturn(String target) {
    if (target == null || target.isBlank()) return origin + "/";
    try {
      URI value = URI.create(target);
      if (value.getRawUserInfo() != null || value.getRawFragment() != null || target.contains("\\")) return (
        origin + "/"
      );
      if (target.startsWith("/") && !target.startsWith("//")) return origin + target;
      String host = value.getScheme() + "://" + value.getRawAuthority();
      if (host.equals(origin) || host.equals(canvasOrigin)) return target;
    } catch (IllegalArgumentException ignored) {
      /* Fall back to the known origin. */
    }
    return origin + "/";
  }

  public String logout() {
    return domain + "/logout?client_id=" + encode(clientId) + "&logout_uri=" + encode(origin + "/");
  }

  private static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }
}
