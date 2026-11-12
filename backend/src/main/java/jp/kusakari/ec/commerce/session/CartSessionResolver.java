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
  // ログインしていなければ 401。店舗側・申請中のアカウントは購入者の API を使えないので 403（#108）。
  // カート・注文・庭の買い物リストの API は、すべてここを通る。
  public String resolve(HttpServletRequest request, HttpServletResponse response) {
    return memberCarts.resolve(auth.requireBuyer().getId());
  }
}
