package jp.kusakari.ec.payment.service;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Stripe の呼び出しを、DB のトランザクションがコミットされた後に行う（ロックを持ったまま外部を呼ばない）。 */
final class AfterCommit {

  private AfterCommit() {}

  static void run(Runnable action) {
    TransactionSynchronizationManager.registerSynchronization(
      new TransactionSynchronization() {
        @Override
        public void afterCommit() {
          action.run();
        }
      }
    );
  }
}
