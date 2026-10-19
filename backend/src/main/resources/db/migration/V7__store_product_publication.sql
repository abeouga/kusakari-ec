ALTER TABLE inventory
  ADD publication_status VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
  ADD CONSTRAINT inventory_publication_status CHECK (publication_status IN ('PUBLISHED', 'HIDDEN', 'DELETED'));
UPDATE inventory i JOIN products p ON p.id = i.product_id
SET i.publication_status = 'DELETED' WHERE p.active = FALSE;
