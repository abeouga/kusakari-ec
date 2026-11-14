package jp.kusakari.ec.store.service;

import java.time.Duration;
import java.time.Instant;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.payment.service.AfterCommit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 閉鎖中の店舗・受付停止中の組織を、未完了の注文がなくなった時点で閉鎖済み・停止にする（#79・#109）。
 * 注文の状態が変わったとき（受け渡し・キャンセルの承認）にコミットの後で確かめ、ほかの経路（支払いの失敗・時間切れ）は
 * 1分ごとの定期処理で拾う。閉鎖済みから90日たった店舗の連絡先は、1日1回の定期処理で消す（MySQL のイベントは使わない）。
 */
@Component
@EnableScheduling
public class ClosureSettlement {

  private static final Logger log = LoggerFactory.getLogger(ClosureSettlement.class);

  /** 閉鎖済みから連絡先を消すまでの日数（#79 決定事項10）。 */
  static final Duration CONTACT_RETENTION = Duration.ofDays(90);

  private final StoreClosureService closures;
  private final OrganizationSuspensionService suspensions;
  private final StoreRepository stores;
  private final TransactionTemplate separate;

  public ClosureSettlement(
    StoreClosureService closures,
    OrganizationSuspensionService suspensions,
    StoreRepository stores,
    PlatformTransactionManager transactions
  ) {
    this.closures = closures;
    this.suspensions = suspensions;
    this.stores = stores;
    this.separate = new TransactionTemplate(transactions);
    this.separate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /**
   * 注文の状態を変えたトランザクションの中から呼ぶ。コミットの後、別のトランザクションで店舗と組織を確かめる
   * （注文の行のロックを持ったまま店舗・組織の行をロックしない。まとめてキャンセルは店舗・組織 → 注文の順にロックする）。
   */
  public void afterOrderChanged(long storeId) {
    AfterCommit.run(() -> settleStore(storeId));
  }

  @Scheduled(fixedDelayString = "${kusakari.ec.closure-settlement-interval-ms:60000}", initialDelay = 15000)
  public void settleAll() {
    stores.findClosingIds().forEach(this::settleStore);
    suspensions.notAcceptingIds().forEach(this::settleOrganization);
  }

  /** 閉鎖済みになってから90日たった店舗の連絡先を消す。行は消さない。 */
  @Scheduled(fixedDelayString = "${kusakari.ec.store-contact-purge-interval-ms:86400000}", initialDelay = 30000)
  public void clearClosedContacts() {
    try {
      Integer cleared = separate.execute(status -> stores.clearClosedContacts(Instant.now().minus(CONTACT_RETENTION)));
      if (cleared != null && cleared > 0) log.info("Cleared the contacts of {} closed store(s).", cleared);
    } catch (RuntimeException error) {
      // 次の回にもう一度試す。失敗はログに残る（MySQL のエラーログだけに残るイベントの代わり）。
      log.warn("Closed store contacts could not be cleared ({}).", error.getClass().getSimpleName());
    }
  }

  private void settleStore(long storeId) {
    try {
      separate.executeWithoutResult(status -> closures.settle(storeId));
      Long organizationId = stores.findById(storeId).map(s -> s.getOrganizationId()).orElse(null);
      if (organizationId != null) settleOrganization(organizationId);
    } catch (RuntimeException error) {
      // 1件の失敗で残りを止めない。次の定期処理でもう一度確かめる。
      log.warn("Store {} could not be settled ({}).", storeId, error.getClass().getSimpleName());
    }
  }

  private void settleOrganization(long organizationId) {
    try {
      separate.executeWithoutResult(status -> suspensions.settle(organizationId));
    } catch (RuntimeException error) {
      log.warn("Organization {} could not be settled ({}).", organizationId, error.getClass().getSimpleName());
    }
  }
}
