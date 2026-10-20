-- Only the identity-generation attribute changes; existing keys retain their values/type.
SET @previous_foreign_key_checks = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;
ALTER TABLE stores MODIFY id BIGINT NOT NULL AUTO_INCREMENT,
 ADD company VARCHAR(100) NOT NULL DEFAULT '', ADD contact VARCHAR(100) NOT NULL DEFAULT '',
 ADD email VARCHAR(200) NOT NULL DEFAULT '', ADD story VARCHAR(1000) NOT NULL DEFAULT '',
 ADD enabled BOOLEAN NOT NULL DEFAULT TRUE, ADD revision BIGINT NOT NULL DEFAULT 0;
SET FOREIGN_KEY_CHECKS = @previous_foreign_key_checks;
ALTER TABLE auth_members ADD withdrawn_at TIMESTAMP NULL;
ALTER TABLE products ADD suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD buyer_member_id CHAR(36) NULL, ADD store_id BIGINT NULL,
 ADD pickup_address VARCHAR(200) NOT NULL DEFAULT '', ADD pickup_hours VARCHAR(80) NOT NULL DEFAULT '',
 ADD ready_at TIMESTAMP NULL, ADD picked_up_at TIMESTAMP NULL,
 ADD cancellation_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
 ADD cancellation_reason VARCHAR(500) NOT NULL DEFAULT '', ADD cancellation_response VARCHAR(500) NOT NULL DEFAULT '',
 ADD cancellation_at TIMESTAMP NULL,
 ADD FOREIGN KEY(buyer_member_id) REFERENCES auth_members(id), ADD FOREIGN KEY(store_id) REFERENCES stores(id),
 ADD INDEX orders_buyer(buyer_member_id,created_at), ADD INDEX orders_store(store_id,created_at);
UPDATE orders o JOIN carts c ON c.id=o.cart_id SET o.buyer_member_id=c.member_id;
-- Historical store identity is recovered only from an unambiguous saved name.
UPDATE orders o JOIN (SELECT name,MIN(id) id FROM stores GROUP BY name HAVING COUNT(*)=1) s ON s.name=o.store_name SET o.store_id=s.id;
CREATE TABLE member_addresses (
 member_id CHAR(36) PRIMARY KEY, recipient VARCHAR(100) NOT NULL, postal VARCHAR(8) NOT NULL,
 address VARCHAR(200) NOT NULL, FOREIGN KEY(member_id) REFERENCES auth_members(id)
);
CREATE TABLE notifications (
 id CHAR(36) PRIMARY KEY, member_id CHAR(36) NOT NULL, title VARCHAR(200) NOT NULL,
 body VARCHAR(1000) NOT NULL, created_at TIMESTAMP NOT NULL, read_at TIMESTAMP NULL,
 FOREIGN KEY(member_id) REFERENCES auth_members(id), INDEX notice_recipient(member_id,created_at)
);
CREATE TABLE categories (name VARCHAR(30) PRIMARY KEY);
INSERT INTO categories(name) SELECT DISTINCT category FROM products;
CREATE TABLE store_applications (
 id CHAR(36) PRIMARY KEY, member_id CHAR(36) NOT NULL, company VARCHAR(100) NOT NULL,
 contact VARCHAR(100) NOT NULL, email VARCHAR(200) NOT NULL, address VARCHAR(200) NOT NULL,
 phone VARCHAR(30) NOT NULL, plan VARCHAR(30) NOT NULL, status VARCHAR(20) NOT NULL,
 reason VARCHAR(500) NOT NULL DEFAULT '', created_at TIMESTAMP NOT NULL, reviewed_at TIMESTAMP NULL,
 document_name VARCHAR(200) NOT NULL, document_type VARCHAR(100) NOT NULL, document_data LONGBLOB NOT NULL,
 FOREIGN KEY(member_id) REFERENCES auth_members(id), INDEX application_member(member_id,status)
);
