CREATE TABLE garden_shopping_lists (
  cart_id CHAR(36) NOT NULL,
  garden_id CHAR(36) NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (cart_id, garden_id),
  FOREIGN KEY (cart_id) REFERENCES carts(id)
);

CREATE TABLE garden_shopping_items (
  cart_id CHAR(36) NOT NULL,
  garden_id CHAR(36) NOT NULL,
  product_id VARCHAR(40) NOT NULL,
  PRIMARY KEY (cart_id, garden_id, product_id),
  FOREIGN KEY (cart_id, garden_id) REFERENCES garden_shopping_lists(cart_id, garden_id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
