-- 通知の種別と、店舗あての通知の店舗（#169）。
-- PERSONAL：本人あての通知（注文の受付、申請の結果、担当から外れたことなど）。所属する店舗がなくても見られる。
-- STORE：店舗あての通知（新しい注文、キャンセル申請、警告など）。担当者は、その店舗に所属している間だけ見られる。
-- 店舗から外された担当者は、外される前に見えていた店舗あての通知も見られなくなる（#169 の決定）。
ALTER TABLE notifications
  ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'PERSONAL' AFTER member_id,
  ADD COLUMN store_id BIGINT NULL AFTER kind,
  ADD KEY idx_notifications_store (store_id),
  ADD CONSTRAINT ck_notifications_kind CHECK (BINARY kind IN ('PERSONAL','STORE')),
  ADD CONSTRAINT ck_notifications_store CHECK (kind = 'STORE' OR store_id IS NULL),
  ADD CONSTRAINT fk_notifications_store FOREIGN KEY (store_id) REFERENCES stores (id);

-- これまでの通知は店舗を持たない。担当者（SHOP_STAFF）に届いた通知は店舗あて（toStore）だけなので、
-- 店舗あてにして、どの店舗にも所属していない担当者には見せない。店舗が分からないので store_id は空のまま。
UPDATE notifications n
  JOIN members m ON m.id = n.member_id
   SET n.kind = 'STORE'
 WHERE m.account_type = 'SHOP_STAFF';
