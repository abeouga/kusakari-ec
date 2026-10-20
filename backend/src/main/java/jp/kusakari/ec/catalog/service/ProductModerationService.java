package jp.kusakari.ec.catalog.service;

import java.util.*;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.persistence.repository.*;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.notification.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ProductModerationService {

  private final AuthService auth;
  private final ProductRepository products;
  private final NotificationService notices;

  public record Product(String id, String name, String ownerMemberId, boolean active, boolean suspended) {}

  @Transactional(readOnly = true)
  public List<Product> list() {
    auth.requireAdmin();
    return products
      .findAll()
      .stream()
      .map(p -> new Product(p.getId(), p.getName(), p.getOwnerMemberId(), p.isActive(), p.isSuspended()))
      .toList();
  }

  public void suspend(String id, boolean suspended, String reason) {
    auth.requireAdmin();
    var p = products
      .findLocked(id)
      .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "商品が見つかりません。"));
    if (p.isSuspended() == suspended) return;
    p.moderate(suspended);
    notices.send(
      p.getOwnerMemberId(),
      suspended ? "商品の公開を停止しました" : "商品の公開停止を解除しました",
      p.getName() + " / " + reason
    );
  }
}
