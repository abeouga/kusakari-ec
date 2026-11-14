-- 組織の受付停止・停止・取り消し（再開）の履歴（#109）。店舗の store_moderation_events と同じ形にそろえる。
-- STOP_ACCEPTING：運営が受付を止めた（理由は必須）。SUSPEND：未完了の注文がなくなり停止になった（自動なので操作した人は空）。
-- RESUME：運営が受付停止を取り消した、または停止を解いて通常に戻した。
CREATE TABLE organization_moderation_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  organization_id BIGINT NOT NULL,
  event_type VARCHAR(16) NOT NULL,
  reason VARCHAR(1000) NOT NULL DEFAULT '',
  actor_member_id CHAR(36) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_organization_moderation_target (organization_id, id),
  CONSTRAINT ck_organization_moderation_type CHECK (BINARY event_type IN ('STOP_ACCEPTING','SUSPEND','RESUME')),
  CONSTRAINT ck_organization_moderation_reason CHECK (event_type <> 'STOP_ACCEPTING' OR reason <> ''),
  CONSTRAINT ck_organization_moderation_actor CHECK (event_type = 'SUSPEND' OR actor_member_id IS NOT NULL),
  CONSTRAINT fk_organization_moderation_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_organization_moderation_actor FOREIGN KEY (actor_member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
