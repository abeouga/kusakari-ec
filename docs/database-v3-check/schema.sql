-- Kusakari EC の新しい DB 構成（v3）のテーブル定義。docs/database-er.md と同じ内容。
-- 制約の試験（run.sh）に使う。Flyway のマイグレーションは、この定義から ec#107 で作る。
-- 使い捨ての MySQL だけで実行し、開発用・E2E 用の DB では実行しない。
SET NAMES utf8mb4;

CREATE TABLE members (
  id CHAR(36) NOT NULL,
  issuer VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  account_type VARCHAR(32) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at TIMESTAMP(6) NULL,
  withdrawn_at TIMESTAMP(6) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_members_issuer_subject (issuer, subject),
  UNIQUE KEY uk_members_id_type (id, account_type),
  KEY idx_members_issuer_email (issuer, email),
  CONSTRAINT ck_members_account_type CHECK (BINARY account_type IN
    ('USER','SHOP_OWNER_APPLICANT','SHOP_OWNER','SHOP_STAFF','ADMIN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE member_pickup_contacts (
  member_id CHAR(36) NOT NULL,
  recipient_name VARCHAR(120) NOT NULL DEFAULT '',
  recipient_phone VARCHAR(40) NOT NULL DEFAULT '',
  contact_email VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (member_id),
  CONSTRAINT fk_pickup_contacts_member FOREIGN KEY (member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
  id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  read_at TIMESTAMP(6) NULL,
  PRIMARY KEY (id),
  KEY idx_notifications_member (member_id, read_at, created_at),
  CONSTRAINT fk_notifications_member FOREIGN KEY (member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE organizations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  owner_member_id CHAR(36) NULL,
  owner_account_type VARCHAR(32) NOT NULL DEFAULT 'SHOP_OWNER',
  -- 通常：suspension_started_at が NULL。受付停止中：日時あり・suspended = FALSE。停止：suspended = TRUE
  suspension_started_at TIMESTAMP(6) NULL,
  suspended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_organizations_owner (owner_member_id),
  CONSTRAINT ck_organizations_suspension CHECK (suspended = FALSE OR suspension_started_at IS NOT NULL),
  CONSTRAINT ck_organizations_owner_type CHECK (BINARY owner_account_type = 'SHOP_OWNER'),
  CONSTRAINT fk_organizations_owner FOREIGN KEY (owner_member_id, owner_account_type)
    REFERENCES members (id, account_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE organization_applications (
  id CHAR(36) NOT NULL,
  applicant_member_id CHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  -- TRUE = 今の申請、FALSE = 前回の申請。1人につき、それぞれ1行まで
  is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  organization_name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(120) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(40) NOT NULL,
  company_address VARCHAR(255) NOT NULL,
  rejection_reason VARCHAR(1000) NULL,
  document_name VARCHAR(255) NULL,
  document_type VARCHAR(100) NULL,
  document_data LONGBLOB NULL,
  organization_id BIGINT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  submitted_at TIMESTAMP(6) NULL,
  reviewed_at TIMESTAMP(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_applications_applicant_latest (applicant_member_id, is_latest),
  UNIQUE KEY uk_applications_organization (organization_id),
  CONSTRAINT ck_applications_status CHECK (BINARY status IN
    ('DRAFT','SUBMITTED','APPROVED','REJECTED','WITHDRAWN')),
  CONSTRAINT ck_applications_approved CHECK ((status = 'APPROVED') = (organization_id IS NOT NULL)),
  CONSTRAINT ck_applications_previous CHECK (is_latest OR status IN ('REJECTED','WITHDRAWN')),
  CONSTRAINT fk_applications_applicant FOREIGN KEY (applicant_member_id) REFERENCES members (id),
  CONSTRAINT fk_applications_organization FOREIGN KEY (organization_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE organization_members (
  organization_id BIGINT NOT NULL,
  member_id CHAR(36) NOT NULL,
  member_account_type VARCHAR(32) NOT NULL DEFAULT 'SHOP_STAFF',
  -- 人事のロール。NULL = ロールなし。店舗の操作のロールは store_members.role
  role VARCHAR(16) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (organization_id, member_id),
  UNIQUE KEY uk_org_members_member (member_id),
  CONSTRAINT ck_org_members_type CHECK (BINARY member_account_type = 'SHOP_STAFF'),
  CONSTRAINT ck_org_members_role CHECK (BINARY role IN ('ORG_ADMIN')),
  CONSTRAINT fk_org_members_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_org_members_member FOREIGN KEY (member_id, member_account_type)
    REFERENCES members (id, account_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stores (
  id BIGINT NOT NULL AUTO_INCREMENT,
  organization_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(255) NOT NULL DEFAULT '',
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  business_hours VARCHAR(255) NOT NULL DEFAULT '',
  contact_name VARCHAR(120) NOT NULL DEFAULT '',
  contact_email VARCHAR(255) NOT NULL DEFAULT '',
  introduction VARCHAR(2000) NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  suspended BOOLEAN NOT NULL DEFAULT FALSE,
  -- 営業中：closing_started_at が NULL。閉鎖中：日時あり・closed_at が NULL。閉鎖済み：closed_at あり
  closing_started_at TIMESTAMP(6) NULL,
  closing_started_by VARCHAR(16) NULL,
  closed_at TIMESTAMP(6) NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_stores_id_org (id, organization_id),
  UNIQUE KEY uk_stores_org_name (organization_id, name),
  CONSTRAINT ck_stores_location CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT ck_stores_closing CHECK ((closing_started_at IS NULL) = (closing_started_by IS NULL)),
  CONSTRAINT ck_stores_closing_by CHECK (BINARY closing_started_by IN ('OWNER','ADMIN')),
  CONSTRAINT ck_stores_closed CHECK (closed_at IS NULL OR closing_started_at IS NOT NULL),
  CONSTRAINT fk_stores_org FOREIGN KEY (organization_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE store_members (
  store_id BIGINT NOT NULL,
  member_id CHAR(36) NOT NULL,
  organization_id BIGINT NOT NULL,
  role VARCHAR(16) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (store_id, member_id),
  KEY idx_store_members_member (organization_id, member_id),
  CONSTRAINT ck_store_members_role CHECK (BINARY role IN ('MANAGER','STAFF')),
  CONSTRAINT fk_store_members_store FOREIGN KEY (store_id, organization_id)
    REFERENCES stores (id, organization_id),
  CONSTRAINT fk_store_members_member FOREIGN KEY (organization_id, member_id)
    REFERENCES organization_members (organization_id, member_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE store_invitations (
  id CHAR(36) NOT NULL,
  store_id BIGINT NOT NULL,
  issued_by_member_id CHAR(36) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP(6) NOT NULL,
  -- 1 = 1回限り、NULL = 有効期限内なら何回でも。超えないことは、キーの行をロックしてアプリが確かめる
  max_uses INT NULL,
  revoked_at TIMESTAMP(6) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_invitations_key (key_hash),
  KEY idx_invitations_store (store_id),
  CONSTRAINT ck_invitations_max_uses CHECK (max_uses IS NULL OR max_uses >= 1),
  CONSTRAINT fk_invitations_store FOREIGN KEY (store_id) REFERENCES stores (id),
  CONSTRAINT fk_invitations_issuer FOREIGN KEY (issued_by_member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 招待キーを使った人。キーが使えるのは新規登録のときだけなので、1人につき1行まで
CREATE TABLE store_invitation_uses (
  invitation_id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  used_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (invitation_id, member_id),
  UNIQUE KEY uk_invitation_uses_member (member_id),
  CONSTRAINT fk_invitation_uses_invitation FOREIGN KEY (invitation_id) REFERENCES store_invitations (id),
  CONSTRAINT fk_invitation_uses_member FOREIGN KEY (member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE categories (
  name VARCHAR(80) NOT NULL,
  deleted_at TIMESTAMP(6) NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 説明・サイズ・育て方などの列は、今の products の列をそのまま持つ
CREATE TABLE products (
  id VARCHAR(40) NOT NULL,
  store_id BIGINT NOT NULL,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  latin_name VARCHAR(120) NOT NULL,
  category_name VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  size_label VARCHAR(80) NOT NULL,
  care TEXT NOT NULL,
  price_yen INT NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'piece',
  image_url VARCHAR(250) NOT NULL,
  badge VARCHAR(30) NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'demo',
  source_product_id VARCHAR(120) NULL,
  source_updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  nursery_name VARCHAR(100) NOT NULL DEFAULT '',
  nursery_address VARCHAR(200) NOT NULL DEFAULT '',
  sunlight VARCHAR(30) NOT NULL DEFAULT '未設定',
  use_case VARCHAR(80) NOT NULL DEFAULT '',
  care_level INT NOT NULL DEFAULT 1,
  min_temperature_c INT NULL,
  heat_tolerant BOOLEAN NOT NULL DEFAULT FALSE,
  drought_tolerant BOOLEAN NOT NULL DEFAULT FALSE,
  age_years INT NULL,
  height_cm INT NULL,
  pot_diameter_cm INT NULL,
  family_name VARCHAR(100) NOT NULL DEFAULT '',
  flowering_description TEXT NULL,
  seasonal_care TEXT NULL,
  style_description TEXT NULL,
  plant_model_profile JSON NULL,
  model_composition JSON NULL,
  suspended BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_products_store_sku (store_id, sku),
  CONSTRAINT ck_products_price CHECK (price_yen > 0),
  CONSTRAINT ck_products_care_level CHECK (care_level BETWEEN 1 AND 3),
  CONSTRAINT fk_products_store FOREIGN KEY (store_id) REFERENCES stores (id),
  CONSTRAINT fk_products_category FOREIGN KEY (category_name) REFERENCES categories (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inventory (
  product_id VARCHAR(40) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  publication_status VARCHAR(16) NOT NULL DEFAULT 'HIDDEN',
  PRIMARY KEY (product_id),
  CONSTRAINT ck_inventory_quantity CHECK (quantity >= 0),
  CONSTRAINT ck_inventory_status CHECK (BINARY publication_status IN ('PUBLISHED','HIDDEN','DELETED')),
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_images (
  product_id VARCHAR(40) NOT NULL,
  sort_order INT NOT NULL,
  image_url VARCHAR(2048) NOT NULL,
  PRIMARY KEY (product_id, sort_order),
  CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 画像の本体。今のテーブルのまま
CREATE TABLE product_media (
  id VARCHAR(36) NOT NULL,
  content_type VARCHAR(30) NOT NULL,
  image_data LONGBLOB NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 素材コードと商品の対応。今のテーブルのまま（残すかは ec#119 で決める）
CREATE TABLE material_products (
  material_code VARCHAR(80) NOT NULL,
  product_id VARCHAR(40) NOT NULL,
  PRIMARY KEY (material_code, product_id),
  CONSTRAINT fk_material_products_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE carts (
  id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_carts_member (member_id),
  CONSTRAINT fk_carts_member FOREIGN KEY (member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cart_items (
  cart_id CHAR(36) NOT NULL,
  product_id VARCHAR(40) NOT NULL,
  quantity INT NOT NULL,
  PRIMARY KEY (cart_id, product_id),
  CONSTRAINT ck_cart_items_quantity CHECK (quantity BETWEEN 1 AND 99),
  CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES carts (id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE garden_shopping_lists (
  cart_id CHAR(36) NOT NULL,
  garden_id CHAR(36) NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (cart_id, garden_id),
  CONSTRAINT fk_garden_lists_cart FOREIGN KEY (cart_id) REFERENCES carts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE garden_shopping_items (
  cart_id CHAR(36) NOT NULL,
  garden_id CHAR(36) NOT NULL,
  product_id VARCHAR(40) NOT NULL,
  PRIMARY KEY (cart_id, garden_id, product_id),
  CONSTRAINT fk_garden_items_list FOREIGN KEY (cart_id, garden_id)
    REFERENCES garden_shopping_lists (cart_id, garden_id) ON DELETE CASCADE,
  CONSTRAINT fk_garden_items_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- お会計1回につき決済1つ（Stripe の PaymentIntent。テストモードだけ）。名前と状態の値は #131 が決まるまで仮
CREATE TABLE payments (
  id CHAR(36) NOT NULL,
  cart_id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  buyer_member_id CHAR(36) NOT NULL,
  payment_intent_id VARCHAR(255) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  amount_yen INT NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_payments_checkout (cart_id, request_id),
  UNIQUE KEY uk_payments_intent (payment_intent_id),
  UNIQUE KEY uk_payments_id_checkout (id, cart_id, request_id),
  CONSTRAINT ck_payments_status CHECK (BINARY status IN ('PENDING','SUCCEEDED','FAILED','EXPIRED')),
  CONSTRAINT ck_payments_amount CHECK (amount_yen > 0),
  CONSTRAINT fk_payments_cart FOREIGN KEY (cart_id) REFERENCES carts (id),
  CONSTRAINT fk_payments_buyer FOREIGN KEY (buyer_member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 処理済みの Stripe の通知（Webhook）。同じ通知を2回処理しないための記録
CREATE TABLE stripe_events (
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE orders (
  id CHAR(36) NOT NULL,
  cart_id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  request_revision BIGINT NOT NULL,
  payment_id CHAR(36) NULL,
  buyer_member_id CHAR(36) NOT NULL,
  store_id BIGINT NOT NULL,
  store_name VARCHAR(120) NOT NULL,
  store_address VARCHAR(255) NOT NULL,
  store_business_hours VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL,
  total_yen INT NOT NULL,
  -- 注文したときの手数料の率（1万分率。800 = 8%）と額。後で率を変えても過去の注文は変わらない
  commission_rate_bp INT NOT NULL,
  commission_yen INT NOT NULL,
  payment_method VARCHAR(32) NOT NULL,
  recipient_name VARCHAR(120) NOT NULL,
  recipient_phone VARCHAR(40) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  cancellation_status VARCHAR(24) NOT NULL DEFAULT 'NONE',
  cancellation_reason VARCHAR(1000) NOT NULL DEFAULT '',
  cancellation_response VARCHAR(1000) NOT NULL DEFAULT '',
  cancellation_at TIMESTAMP(6) NULL,
  -- キャンセルした人（店舗の担当者・オーナー・運営）。運営か店舗かは会員の種別で分かる
  cancelled_by_member_id CHAR(36) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ready_at TIMESTAMP(6) NULL,
  picked_up_at TIMESTAMP(6) NULL,
  deleted_at TIMESTAMP(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_orders_request (cart_id, request_id, store_id),
  UNIQUE KEY uk_orders_id_payment (id, payment_id),
  KEY idx_orders_buyer (buyer_member_id, created_at),
  KEY idx_orders_store (store_id, status, created_at),
  CONSTRAINT ck_orders_status CHECK (BINARY status IN ('PENDING_PAYMENT','ACCEPTED','READY','COMPLETED','CANCELLED')),
  CONSTRAINT ck_orders_cancellation_status CHECK (BINARY cancellation_status IN ('NONE','PENDING','APPROVED','REJECTED')),
  CONSTRAINT ck_orders_commission_rate CHECK (commission_rate_bp BETWEEN 0 AND 10000),
  CONSTRAINT ck_orders_commission CHECK (commission_yen >= 0 AND commission_yen <= total_yen),
  CONSTRAINT fk_orders_cart FOREIGN KEY (cart_id) REFERENCES carts (id),
  -- 注文は、同じお会計（cart_id, request_id）の決済だけを指せる
  CONSTRAINT fk_orders_payment FOREIGN KEY (payment_id, cart_id, request_id)
    REFERENCES payments (id, cart_id, request_id),
  CONSTRAINT fk_orders_cancelled_by FOREIGN KEY (cancelled_by_member_id) REFERENCES members (id),
  CONSTRAINT fk_orders_buyer FOREIGN KEY (buyer_member_id) REFERENCES members (id),
  CONSTRAINT fk_orders_store FOREIGN KEY (store_id) REFERENCES stores (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE order_items (
  order_id CHAR(36) NOT NULL,
  product_id VARCHAR(40) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  quantity INT NOT NULL,
  unit_price_yen INT NOT NULL,
  PRIMARY KEY (order_id, product_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 返金（#133。Stripe の Refund。テストモードだけ）。注文1件につき1行。名前と状態の値は #131 が決まるまで仮
CREATE TABLE refunds (
  id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  payment_id CHAR(36) NOT NULL,
  stripe_refund_id VARCHAR(255) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'REQUESTED',
  amount_yen INT NOT NULL,
  -- 返金を始めた人。Stripe の管理画面から返金されたときは NULL
  requested_by_member_id CHAR(36) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_refunds_order (order_id),
  UNIQUE KEY uk_refunds_stripe (stripe_refund_id),
  KEY idx_refunds_payment (payment_id),
  CONSTRAINT ck_refunds_status CHECK (BINARY status IN ('REQUESTED','SUCCEEDED','FAILED')),
  CONSTRAINT ck_refunds_amount CHECK (amount_yen > 0),
  -- 返金は、その注文が支払われた決済だけを指せる
  CONSTRAINT fk_refunds_order FOREIGN KEY (order_id, payment_id) REFERENCES orders (id, payment_id),
  CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payments (id),
  CONSTRAINT fk_refunds_requested_by FOREIGN KEY (requested_by_member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 運営による警告・警告解除・停止・再開の履歴（#16）。行は書き換えず、削除もしない
CREATE TABLE product_moderation_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  product_id VARCHAR(40) NOT NULL,
  event_type VARCHAR(16) NOT NULL,
  reason VARCHAR(1000) NOT NULL DEFAULT '',
  actor_member_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_product_moderation_target (product_id, id),
  CONSTRAINT ck_product_moderation_type CHECK (BINARY event_type IN ('WARN','CLEAR_WARNING','SUSPEND','RESUME')),
  CONSTRAINT ck_product_moderation_reason CHECK (event_type NOT IN ('WARN','SUSPEND') OR reason <> ''),
  CONSTRAINT fk_product_moderation_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_product_moderation_actor FOREIGN KEY (actor_member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE store_moderation_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  store_id BIGINT NOT NULL,
  event_type VARCHAR(16) NOT NULL,
  reason VARCHAR(1000) NOT NULL DEFAULT '',
  actor_member_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_store_moderation_target (store_id, id),
  CONSTRAINT ck_store_moderation_type CHECK (BINARY event_type IN ('WARN','CLEAR_WARNING','SUSPEND','RESUME')),
  CONSTRAINT ck_store_moderation_reason CHECK (event_type NOT IN ('WARN','SUSPEND') OR reason <> ''),
  CONSTRAINT fk_store_moderation_store FOREIGN KEY (store_id) REFERENCES stores (id),
  CONSTRAINT fk_store_moderation_actor FOREIGN KEY (actor_member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2026-11-13（#109）：V3 のマイグレーションで足した。
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
