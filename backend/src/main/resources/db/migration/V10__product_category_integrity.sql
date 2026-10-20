ALTER TABLE products ADD CONSTRAINT fk_product_category
 FOREIGN KEY (category) REFERENCES categories(name);
