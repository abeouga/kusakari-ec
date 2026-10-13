-- Add matching demo items without replacing existing catalog data.
INSERT INTO products(id,sku,name,latin_name,category,description,size_label,care,price_yen,image_url,badge,nursery_name) VALUES
('canvas-oak','KS-CVS-OAK','コナラ（Canvas 木モデル対応）','Quercus serrata','庭木','Canvasの配置モデルに対応する架空のデモ商品です。実商品の販売ではありません。','樹高約4m・モデルの表示寸法目安','環境と製品に合わせて管理してください。',12800,'/images/tree_oak.svg','Canvas対応','Kusakari デモ出店者'),
('canvas-boxwood','KS-CVS-BOX','ボックスウッド（Canvas 低木モデル対応）','Buxus','庭木','Canvasの配置モデルに対応する架空のデモ商品です。実商品の販売ではありません。','約1.2m・モデルの表示寸法目安','環境と製品に合わせて管理してください。',3600,'/images/shrub_boxwood.svg','Canvas対応','Kusakari デモ出店者'),
('canvas-brick','KS-CVS-BRK','ガーデンレンガ（Canvasモデル対応）','','鉢・庭材','Canvasの配置モデルに対応する架空のデモ商品です。実商品の販売ではありません。','0.6 × 0.15 × 0.2m・デモ規格','環境と製品に合わせて管理してください。',680,'/images/brick_paver.svg','Canvas対応','Kusakari デモ出店者'),
('canvas-bench','KS-CVS-BNC','木製ガーデンベンチ（Canvasモデル対応）','','鉢・庭材','Canvasの配置モデルに対応する架空のデモ商品です。実商品の販売ではありません。','1.6 × 0.85 × 0.65m・デモ規格','環境と製品に合わせて管理してください。',24800,'/images/bench_wood.svg','Canvas対応','Kusakari デモ出店者');
INSERT INTO inventory(store_id,product_id,quantity) SELECT stores.id,products.id,200 FROM stores CROSS JOIN products WHERE products.id IN ('canvas-oak','canvas-boxwood','canvas-brick','canvas-bench');
INSERT INTO material_products(material_code,product_id) VALUES ('plant.oak','canvas-oak'),('plant.boxwood','canvas-boxwood'),('garden.brick','canvas-brick'),('garden.bench','canvas-bench');
