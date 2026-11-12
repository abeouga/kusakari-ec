package jp.kusakari.ec.member.service;

import jakarta.persistence.EntityManager;
import java.util.List;
import jp.kusakari.ec.member.service.WithdrawalBlockedException.BlockingOrder;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Reads the conditions that block account withdrawal (EC-B21 7, 8). It runs inside the withdrawal transaction
 * so the decision is made when the delete button is pressed, not when the screen was opened.
 */
@Component
@RequiredArgsConstructor
class WithdrawalGuard {

  /** Workflow states that are neither "引き渡し完了" nor "キャンセル済み". Legacy demo orders have no workflow. */
  private static final List<String> OPEN_STATUSES = List.of("ACCEPTED", "READY");

  private final EntityManager entityManager;

  /** Includes orders hidden from the buyer's history: the store still has to hand them over. */
  List<BlockingOrder> openPurchases(String memberId) {
    return entityManager
      .createQuery(
        "select o.id, o.status from OrderEntity o where o.buyerMemberId = :member " +
          "and (o.status in :open or o.cancellationStatus = 'PENDING') order by o.createdAt desc",
        Object[].class
      )
      .setParameter("member", memberId)
      .setParameter("open", OPEN_STATUSES)
      .getResultList()
      .stream()
      .map(row -> new BlockingOrder((String) row[0], (String) row[1]))
      .toList();
  }

  /** 出品中（在庫の公開状態が PUBLISHED）の商品があるか。非公開・削除済みの商品は数えない。 */
  boolean hasListedProducts(List<Long> storeIds) {
    return (
      entityManager
        .createQuery(
          "select count(i) from InventoryEntity i, ProductEntity p where p.id = i.productId " +
            "and p.storeId in :stores and i.publicationStatus = 'PUBLISHED'",
          Long.class
        )
        .setParameter("stores", storeIds)
        .getSingleResult() > 0
    );
  }

  boolean hasOpenStoreOrders(List<Long> storeIds) {
    return (
      entityManager
        .createQuery(
          "select count(o) from OrderEntity o where o.storeId in :stores " +
            "and (o.status in :open or o.cancellationStatus = 'PENDING')",
          Long.class
        )
        .setParameter("stores", storeIds)
        .setParameter("open", OPEN_STATUSES)
        .getSingleResult() > 0
    );
  }
}
