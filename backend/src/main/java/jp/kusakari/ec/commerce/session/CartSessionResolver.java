package jp.kusakari.ec.commerce.session;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.util.UUID;
import jp.kusakari.ec.commerce.persistence.entity.CartEntity;
import jp.kusakari.ec.commerce.persistence.repository.CartRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseCookie;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CartSessionResolver {

  private static final String COOKIE = "kusakari_cart";
  private final CartRepository carts;
  @Value("${kusakari.ec.secure-cookie:false}")
  private boolean secureCookie;

  public String resolve(HttpServletRequest request, HttpServletResponse response) {
    if (request.getCookies() != null) {
      for (var cookie : request.getCookies()) {
        String id = cookie.getValue();
        if (COOKIE.equals(cookie.getName()) && id.matches("[a-f0-9-]{36}") && carts.existsById(id)) return id;
      }
    }

    String id = UUID.randomUUID().toString();
    carts.saveAndFlush(new CartEntity(id));
    response.addHeader(
      "Set-Cookie",
      ResponseCookie.from(COOKIE, id)
        .httpOnly(true)
        .secure(secureCookie)
        .sameSite("Strict")
        .path("/api")
        .maxAge(Duration.ofDays(30))
        .build()
        .toString()
    );
    return id;
  }
}
