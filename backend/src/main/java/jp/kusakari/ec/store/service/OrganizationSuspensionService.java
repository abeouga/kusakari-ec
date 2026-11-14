package jp.kusakari.ec.store.service;

import java.time.Instant;
import java.util.List;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.notification.service.NotificationService;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationModerationEventEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationModerationEventRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 運営による組織の停止（#109）。通常 → 受付停止中 → 停止 の3段階。
 * 受付停止で配下の全店舗が新しい注文を受け付けなくなり、未完了の注文がなくなった時点で自動で停止（店舗も商品も見えない）になる。
 * 受付停止は取り消せ、停止は再開できる（どちらも通常に戻す）。運営は未完了の注文をまとめてキャンセルできる。
 * 操作と理由は organization_moderation_events に残す。
 */
@Service
@RequiredArgsConstructor
@Transactional
public class OrganizationSuspensionService {

  static final String AUTO_SUSPEND_REASON = "未完了の注文がなくなったため停止しました。";

  private final OrganizationRepository organizations;
  private final OrganizationModerationEventRepository events;
  private final StoreRepository stores;
  private final AuthService auth;
  private final OpenOrders openOrders;
  private final NotificationService notices;

  public record EventView(String type, String reason, boolean automatic, Instant createdAt) {}

  /** status は ACTIVE（通常）・NOT_ACCEPTING（受付停止中）・SUSPENDED（停止）。openOrderCount は停止を止めている注文の件数。 */
  public record OrganizationView(
    long id,
    String name,
    String status,
    Instant suspensionStartedAt,
    int storeCount,
    long openOrderCount,
    List<EventView> events
  ) {}

  @Transactional(readOnly = true)
  public List<OrganizationView> list() {
    auth.requireAdmin();
    return organizations.findAllByOrderByIdAsc().stream().map(this::view).toList();
  }

  /** 受付を止める。未完了の注文がなければ、その場で停止になる。 */
  public OrganizationView stopAccepting(long id, String reason) {
    auth.requireAdmin();
    OrganizationEntity organization = lock(id);
    if (!OrganizationEntity.ACTIVE.equals(organization.status())) throw changed();
    organization.stopAccepting();
    record(organization, OrganizationModerationEventEntity.STOP_ACCEPTING, reason, auth.current().getId());
    notifyOwner(organization, "組織の受付が停止されました", reason);
    openOrders.notifyBuyers(
      storeIds(organization),
      "ご注文の店舗は受付を停止しました",
      "ご注文の商品はこれまでどおりお受け取りいただけます。"
    );
    settle(organization);
    return view(organization);
  }

  /** 受付停止の取り消し、または停止からの再開。通常に戻す。カートや庭から外れた商品は戻さない。 */
  public OrganizationView resume(long id, String reason) {
    auth.requireAdmin();
    OrganizationEntity organization = lock(id);
    if (OrganizationEntity.ACTIVE.equals(organization.status())) throw changed();
    organization.resume();
    record(organization, OrganizationModerationEventEntity.RESUME, reason, auth.current().getId());
    notifyOwner(organization, "組織の受付を再開しました", reason);
    return view(organization);
  }

  /** 受付停止中の組織の未完了の注文をまとめてキャンセルする。そのあと注文が残っていなければ停止になる。 */
  public OrganizationView cancelOrders(long id, String reason) {
    auth.requireAdmin();
    OrganizationEntity organization = lock(id);
    if (!OrganizationEntity.NOT_ACCEPTING.equals(organization.status())) throw new ApiException(
      409,
      "ORGANIZATION_NOT_STOPPED",
      "まとめてキャンセルできるのは、受付停止中の組織だけです。"
    );
    openOrders.cancelAll(storeIds(organization), auth.current().getId(), reason);
    settle(organization);
    return view(organization);
  }

  /** 定期処理と、注文の状態が変わった後に呼ぶ。受付停止中で未完了の注文がなければ停止にする。 */
  public void settle(long id) {
    organizations.lock(id).ifPresent(this::settle);
  }

  private void settle(OrganizationEntity organization) {
    if (!OrganizationEntity.NOT_ACCEPTING.equals(organization.status())) return;
    if (openOrders.count(storeIds(organization)) > 0) return;
    organization.suspend();
    record(organization, OrganizationModerationEventEntity.SUSPEND, AUTO_SUSPEND_REASON, null);
    notifyOwner(organization, "組織が停止されました", AUTO_SUSPEND_REASON);
  }

  @Transactional(readOnly = true)
  public List<Long> notAcceptingIds() {
    return organizations
      .findAllByOrderByIdAsc()
      .stream()
      .filter(o -> OrganizationEntity.NOT_ACCEPTING.equals(o.status()))
      .map(OrganizationEntity::getId)
      .toList();
  }

  private void record(OrganizationEntity organization, String type, String reason, String actor) {
    events.save(new OrganizationModerationEventEntity(organization.getId(), type, reason == null ? "" : reason, actor));
  }

  private void notifyOwner(OrganizationEntity organization, String title, String reason) {
    notices.send(organization.getOwnerMemberId(), title, organization.getName() + (reason == null ? "" : " " + reason));
  }

  private List<Long> storeIds(OrganizationEntity organization) {
    return stores.findByOrganizationIdOrderByIdAsc(organization.getId()).stream().map(StoreEntity::getId).toList();
  }

  private OrganizationView view(OrganizationEntity organization) {
    List<Long> storeIds = storeIds(organization);
    return new OrganizationView(
      organization.getId(),
      organization.getName(),
      organization.status(),
      organization.getSuspensionStartedAt(),
      storeIds.size(),
      openOrders.count(storeIds),
      events
        .findByOrganizationIdOrderByIdDesc(organization.getId())
        .stream()
        .map(e -> new EventView(e.getEventType(), e.getReason(), e.getActorMemberId() == null, e.getCreatedAt()))
        .toList()
    );
  }

  private OrganizationEntity lock(long id) {
    return organizations.lock(id).orElseThrow(() -> new ApiException(404, "ORGANIZATION_NOT_FOUND", "組織が見つかりません。"));
  }

  private static ApiException changed() {
    return new ApiException(409, "ORGANIZATION_CHANGED", "組織の状態が変わりました。最新の状態を確認してください。");
  }
}
