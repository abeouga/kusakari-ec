package jp.kusakari.ec.auth;

import java.util.UUID;
import jp.kusakari.ec.commerce.persistence.entity.CartEntity;
import jp.kusakari.ec.commerce.persistence.repository.CartRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MemberCartService {

  private final AuthMemberRepository members;
  private final CartRepository carts;

  @Transactional
  public String resolve(String memberId) {
    members.lockMember(memberId).orElseThrow();
    return carts
      .findByMemberId(memberId)
      .orElseGet(() -> {
        var cart = new CartEntity(UUID.randomUUID().toString());
        cart.setMemberId(memberId);
        return carts.saveAndFlush(cart);
      })
      .getId();
  }
}
