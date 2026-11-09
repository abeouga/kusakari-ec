-- Issue #70: each cart line is picked up at the store that sells and stocks the product.
-- NULL keeps rows written by older application versions valid; they fall back to the cart's store.
ALTER TABLE cart_items ADD store_id BIGINT NULL,
  ADD CONSTRAINT cart_items_store FOREIGN KEY(store_id) REFERENCES stores(id);
UPDATE cart_items i JOIN carts c ON c.id = i.cart_id SET i.store_id = c.store_id;
-- One checkout request creates one order per pickup store.
ALTER TABLE orders ADD UNIQUE KEY orders_cart_request_store(cart_id, request_id, store_id), DROP INDEX cart_id;
