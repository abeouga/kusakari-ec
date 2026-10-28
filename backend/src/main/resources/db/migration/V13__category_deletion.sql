-- EC-A09: a category referenced only by deleted products is marked deleted instead of being removed,
-- so fk_product_category and the deleted products' records stay intact. No existing row is changed.
ALTER TABLE categories ADD COLUMN deleted_at TIMESTAMP NULL;
