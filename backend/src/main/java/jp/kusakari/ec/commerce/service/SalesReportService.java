package jp.kusakari.ec.commerce.service;

import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.auth.StoreCapabilityPolicy;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.commerce.dto.SalesDtos.SalesReport;
import jp.kusakari.ec.commerce.dto.SalesDtos.SalesRow;
import jp.kusakari.ec.commerce.dto.SalesDtos.SalesStore;
import jp.kusakari.ec.commerce.dto.SalesDtos.SalesTotals;
import jp.kusakari.ec.commerce.mapper.OrderResponseMapper;
import jp.kusakari.ec.commerce.persistence.entity.OrderEntity;
import jp.kusakari.ec.commerce.persistence.repository.OrderRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 店舗の注文実績（#130）。注文1件を1行の一覧と合計を、この1つの処理から返す。読み取りだけで、注文を変えない。
 * 誰が見られるかは {@link StoreCapabilityPolicy} の対応表で決める（閉鎖済みの店舗はオーナー・ORG_ADMIN・運営）。
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SalesReportService {

  private final AuthService auth;
  private final StoreCapabilityPolicy policy;
  private final StoreRepository stores;
  private final OrderRepository orders;
  private final OrderResponseMapper mapper;

  /** 出店者画面（運営も使える）。見られない店舗は、ほかの店舗と同じく 403。 */
  public SalesReport report(long storeId) {
    var store = stores.findById(storeId).orElseThrow(SalesReportService::notFound);
    if (auth.enabled() && !policy.canViewSales(auth.current(), store)) throw new ApiException(
      403,
      "FORBIDDEN",
      "この店舗の注文実績を見る権限がありません。"
    );
    return build(store);
  }

  /** 運営の店舗管理から開く、店舗ごとの注文実績。 */
  public SalesReport operatorReport(long storeId) {
    auth.requireAdmin();
    return build(stores.findById(storeId).orElseThrow(SalesReportService::notFound));
  }

  /**
   * 注文実績を見られる店舗。出店者画面の店舗の候補に、閉鎖済みの店舗が出なくても、ここから選べる。
   * 運営には全店舗、それ以外は自分の組織・担当の店舗のうち、対応表で見られるものだけ。
   */
  public List<SalesStore> viewableStores() {
    auth.requireSellerRole();
    if (!auth.enabled()) return stores.findAllByOrderByIdAsc().stream().map(SalesReportService::store).toList();
    AuthMember member = auth.current();
    List<StoreEntity> candidates = member.isAdmin()
      ? stores.findAllByOrderByIdAsc()
      : stores.findAllById(auth.candidateStoreIdsOf(member));
    return candidates
      .stream()
      .filter(store -> policy.canViewSales(member, store))
      .sorted(Comparator.comparing(StoreEntity::getId))
      .map(SalesReportService::store)
      .toList();
  }

  private SalesReport build(StoreEntity store) {
    List<SalesRow> rows = orders.findByStoreIdOrderByCreatedAtDesc(store.getId()).stream().map(this::row).toList();
    List<SalesRow> counted = rows.stream().filter(SalesRow::counted).toList();
    var totals = new SalesTotals(
      counted.size(),
      (int) rows.stream().filter(r -> "PENDING_PAYMENT".equals(r.status())).count(),
      (int) rows.stream().filter(r -> "CANCELLED".equals(r.status())).count(),
      (int) rows
        .stream()
        .filter(r -> !"CANCELLED".equals(r.status()) && "PENDING".equals(r.cancellationStatus()))
        .count(),
      counted.stream().mapToLong(SalesRow::totalYen).sum(),
      counted.stream().mapToLong(SalesRow::commissionYen).sum(),
      counted.stream().mapToLong(SalesRow::netYen).sum()
    );
    return new SalesReport(store.getId(), store.getName(), store.getClosedAt(), rows, totals);
  }

  private SalesRow row(OrderEntity order) {
    var figures = mapper.figures(order);
    return new SalesRow(
      order.getId(),
      DateTimeFormatter.ISO_INSTANT.format(order.getCreatedAt()),
      order.getStatus(),
      order.getCancellationStatus(),
      order.getPaymentMethod(),
      order.getTotalYen(),
      figures.commissionRateBp(),
      figures.commissionYen(),
      figures.netYen(),
      figures.counted()
    );
  }

  private static SalesStore store(StoreEntity store) {
    return new SalesStore(store.getId(), store.getName(), store.getClosedAt());
  }

  private static ApiException notFound() {
    return new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。");
  }
}
