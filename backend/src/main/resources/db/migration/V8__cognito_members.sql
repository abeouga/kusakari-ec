CREATE TABLE auth_members (
  id CHAR(36) PRIMARY KEY,
  issuer VARCHAR(250) NOT NULL,
  subject VARCHAR(128) NOT NULL,
  email VARCHAR(250) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'USER',
  store_id BIGINT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (issuer, subject),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT auth_member_role CHECK (role IN ('USER', 'SELLER', 'ADMIN')),
  CONSTRAINT auth_seller_store CHECK (role <> 'SELLER' OR store_id IS NOT NULL)
);
ALTER TABLE carts ADD COLUMN member_id CHAR(36) NULL UNIQUE,
  ADD FOREIGN KEY (member_id) REFERENCES auth_members(id);
ALTER TABLE products ADD COLUMN owner_member_id CHAR(36) NULL,
  ADD FOREIGN KEY (owner_member_id) REFERENCES auth_members(id);
