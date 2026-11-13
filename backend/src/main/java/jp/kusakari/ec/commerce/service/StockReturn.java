package jp.kusakari.ec.commerce.service;

import java.util.Collection;
import java.util.Map;
import java.util.stream.Collectors;
import jp.kusakari.ec.catalog.persistence.entity.InventoryEntity;
import jp.kusakari.ec.catalog.persistence.repository.InventoryRepository;
import jp.kusakari.ec.commerce.persistence.repository.OrderItemRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 取り消した注文の在庫を戻す（キャンセルの承認、支払いの失敗・時間切れ）。
 * 呼ぶ側は注文の行をロックしてから呼ぶ。在庫はお会計と同じく商品 ID の昇順でロックし、デッドロックを避ける。
 */
@Component
@RequiredArgsConstructor
public class StockReturn {

  private final OrderItemRepository items;
  private final InventoryRepository inventory;

  @Transactional(propagation = Propagation.MANDATORY)
  public void restock(Collection<String> orderIds) {
    var orderItems = orderIds.stream().flatMap(id -> items.findAllForOrder(id).stream()).toList();
    if (orderItems.isEmpty()) return;
    Map<String, InventoryEntity> stockByProduct = inventory
      .lockAll(orderItems.stream().map(item -> item.getId().getProductId()).distinct().toList())
      .stream()
      .collect(Collectors.toMap(InventoryEntity::getProductId, stock -> stock));
    for (var item : orderItems) {
      var stock = stockByProduct.get(item.getId().getProductId());
      if (stock == null) throw new ApiException(409, "STOCK_NOT_FOUND", "在庫情報が見つかりません。");
      stock.setQuantity(Math.addExact(stock.getQuantity(), item.getQuantity()));
    }
  }
}
