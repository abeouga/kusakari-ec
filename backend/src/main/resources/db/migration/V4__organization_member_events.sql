-- 組織からの除名と、担当者の操作の記録（#178。決定は #170・#173・#177）。
-- 除名はデータを消さない論理削除で、組織への所属に除名中かどうかを持たせる。
-- members.enabled は運営による停止と本人の退会に使っているので、組織側の出来事である除名には使わない（#173）。
ALTER TABLE organization_members
  ADD COLUMN expelled BOOLEAN NOT NULL DEFAULT FALSE AFTER role;

-- 誰がいつ、誰を店舗の担当にした・外した・組織から除名した・復帰させたかの記録。行は書き換えず、足していく。
-- 店舗の担当にする・外す記録には店舗を入れ、除名と復帰の記録では空にする（#177 で #170 の決めること2を改めた）。
-- 店舗は店舗と組織の組で参照し、ほかの組織の店舗が入らないようにする（store_members と同じ作り）。
-- 操作された人が除名されても記録は残す（#170 の決めること4）。除名は論理削除なので members の行も残る。
CREATE TABLE organization_member_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  organization_id BIGINT NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  actor_member_id CHAR(36) NOT NULL,
  target_member_id CHAR(36) NOT NULL,
  store_id BIGINT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_org_member_events_org (organization_id, id),
  KEY idx_org_member_events_store (store_id, id),
  CONSTRAINT ck_org_member_events_type CHECK (
    BINARY event_type IN ('ASSIGN_TO_STORE','REMOVE_FROM_STORE','EXPEL_FROM_ORGANIZATION','REINSTATE_TO_ORGANIZATION')
  ),
  CONSTRAINT ck_org_member_events_store CHECK (
    (event_type IN ('ASSIGN_TO_STORE','REMOVE_FROM_STORE')) = (store_id IS NOT NULL)
  ),
  CONSTRAINT fk_org_member_events_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_org_member_events_actor FOREIGN KEY (actor_member_id) REFERENCES members (id),
  CONSTRAINT fk_org_member_events_target FOREIGN KEY (target_member_id) REFERENCES members (id),
  CONSTRAINT fk_org_member_events_store FOREIGN KEY (store_id, organization_id)
    REFERENCES stores (id, organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
