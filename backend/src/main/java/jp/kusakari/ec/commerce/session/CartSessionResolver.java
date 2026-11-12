package jp.kusakari.ec.commerce.session;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CartSessionResolver {

  private final jp.kusakari.ec.auth.AuthService auth;
  private final jp.kusakari.ec.auth.MemberCartService memberCarts;

  // カートは会員に必ず結び付く（carts.member_id が必須）ので、会員のいない Cookie のカートは作れない。
  // ログインしていなければ、auth.current() が 401 を返す。
  public String resolve(HttpServletRequest request, HttpServletResponse response) {
    return memberCarts.resolve(auth.current().getId());
  }
}
