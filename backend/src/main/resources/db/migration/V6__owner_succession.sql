-- 組織のオーナーの譲渡（#201。決定は #194・#196・#197）。
-- 移行期間は設けず、譲渡先が承認した時点で owner_member_id を付け替えるので、オーナーは常に 1 人のまま（#190）。

-- 承認待ちの譲渡先と、承認の期限（申し出た時刻＋30 分）。申し出がなければ 2 つとも空（#194 の 10・12）。
-- 期限を過ぎた申し出は、次の操作のときに見つけて空に戻す（定期処理は作らない。#194 の 15）。
ALTER TABLE organizations
  ADD COLUMN pending_owner_member_id CHAR(36) NULL AFTER owner_account_type,
  ADD COLUMN pending_owner_expires_at TIMESTAMP(6) NULL AFTER pending_owner_member_id,
  ADD CONSTRAINT ck_organizations_pending_owner CHECK (
    (pending_owner_member_id IS NULL) = (pending_owner_expires_at IS NULL)
  ),
  ADD CONSTRAINT fk_organizations_pending_owner FOREIGN KEY (pending_owner_member_id) REFERENCES members (id);

-- 譲渡の記録の種類（#196 の 3・4・5）。名前は既存の種類に合わせて大文字にする。
-- OWNER_SUCCESSION_AUTO_INVALIDATED が 33 文字なので、種類の列を広げる。譲渡の記録は店舗を持たない。
ALTER TABLE organization_member_events DROP CHECK ck_org_member_events_type;
ALTER TABLE organization_member_events MODIFY event_type VARCHAR(40) NOT NULL;
ALTER TABLE organization_member_events ADD CONSTRAINT ck_org_member_events_type CHECK (
  BINARY event_type IN (
    'ASSIGN_TO_STORE','REMOVE_FROM_STORE','EXPEL_FROM_ORGANIZATION','REINSTATE_TO_ORGANIZATION',
    'OWNER_SUCCESSION_REQUEST','OWNER_SUCCESSION_APPROVAL','OWNER_SUCCESSION_REFUSAL',
    'OWNER_SUCCESSION_CANCELLATION','OWNER_SUCCESSION_AUTO_INVALIDATED'
  )
);

-- 通知の種類（#194 の 17）。重要かどうかは DB に持たず、種類から決める（重要なのは OWNER_SUCCESSION_REQUEST だけ）。
-- 本人あてか店舗あてかを表す kind（V5）とは別の列。これまでの通知は GENERAL にする。
ALTER TABLE notifications
  ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'GENERAL' AFTER store_id,
  ADD CONSTRAINT ck_notifications_category CHECK (BINARY category IN (
    'ORDER','CANCEL_REQUEST','MODERATION','STORE_CLOSURE',
    'OWNER_SUCCESSION_REQUEST','OWNER_SUCCESSION_RESULT','GENERAL'
  ));
