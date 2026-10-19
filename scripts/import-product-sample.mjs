import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importRuntimeTools } from './runtime-tools.mjs';

// Explicit local demo replacement; never runs on application startup.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some((argument) => argument !== '--apply')) throw new Error('Usage: node scripts/import-product-sample.mjs [--apply]');
process.loadEnvFile(join(root, '.env'));
const tools = importRuntimeTools(root);
const address = new URL(process.env.KUSAKARI_EC_DB_URL.replace(/^jdbc:/, ''));
if (address.hostname !== '127.0.0.1' || address.pathname !== '/kusakari' || address.username || address.password) {
  throw new Error('Only the local kusakari development database is supported.');
}
const directory = join(root, 'sample-data/products-20261019');
const readJson = (name) => JSON.parse(readFileSync(join(directory, name), 'utf8').replace(/^\uFEFF/, ''));
const products = readJson('products-store-1.json');
const inventory = readJson('inventory-store-1.json');
const links = readJson('material-links.json');
const metadata = readJson('export-metadata.json');
const ids = new Set(products.map((product) => product.id));
if (products.length !== 31 || ids.size !== 31 || metadata.storeId !== 1 || metadata.productCount !== 31
    || new Set(products.map((product) => product.sku)).size !== 31) throw new Error('Invalid catalog identity.');
for (const product of products) {
  const stock = inventory.find((row) => row.id === product.id);
  if (!stock || stock.stock !== product.stock || stock.sku !== product.sku || product.source !== 'demo'
      || !Number.isInteger(product.priceYen) || product.priceYen <= 0 || !Number.isInteger(product.stock)
      || product.stock < 0 || !product.active || product.unit !== 'piece') throw new Error('Invalid demo product.');
  if (!/^\/images\/[A-Za-z0-9-]+\.png$/.test(product.imageUrl)) throw new Error('Invalid image path.');
  readFileSync(join(root, 'frontend/public', product.imageUrl));
  if (product.canvasMaterialCode !== `product.${product.id}` || !product.modelComposition
      || !links.some((link) => link.productId === product.id && link.materialCode === product.canvasMaterialCode)) {
    throw new Error('Missing Canvas model or material link.');
  }
}
if (links.some((link) => !ids.has(link.productId))) throw new Error('Unknown material product.');
for (const file of readJson('checksums.json')) {
  const path = resolve(root, file.path);
  if (!path.startsWith(root + '/') && !path.startsWith(root + '\\')) throw new Error('Invalid checksum path.');
  if (createHash('sha256').update(readFileSync(path)).digest('hex') !== file.sha256) throw new Error(`Checksum mismatch: ${file.path}`);
}
const executable = (name) => tools.MySql ? join(tools.MySql, `${name}.exe`) : name;
const connection = ['-h', '127.0.0.1', '-P', address.port || '3306', '-u', process.env.KUSAKARI_EC_DB_USER];
const options = { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, MYSQL_PWD: process.env.KUSAKARI_EC_DB_PASSWORD } };
function sql(input) {
  const result = spawnSync(executable('mysql'), [...connection, '--default-character-set=utf8mb4', '--batch', '--skip-column-names', 'kusakari'], { ...options, input });
  if (result.status !== 0) throw new Error('MySQL operation failed; no credentials or row contents printed.');
  return result.stdout.trim();
}
const before = sql('SELECT COUNT(*),SUM(active) FROM products; SELECT COUNT(*) FROM cart_items; SELECT COUNT(*) FROM orders; SELECT COUNT(*) FROM order_items;');
console.log(`Current product/active, cart items, orders, order items:\n${before}`);
console.log('Validated 31 demo products. Existing catalog will be archived; incoming IDs, models and store-1 stock will be preserved.');
if (!apply) {
  console.log('Dry run only. Use --apply to back up and replace the development catalog.');
  process.exit(0);
}
const backupDirectory = join(root, 'artifacts', `product-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(backupDirectory, { recursive: true });
const tables = ['products', 'inventory', 'material_products', 'product_images'];
const backup = spawnSync(executable('mysqldump'), [...connection, '--default-character-set=utf8mb4', '--single-transaction', '--skip-lock-tables', '--no-tablespaces', '--hex-blob', '--no-create-info', '--skip-add-locks', '--skip-triggers', 'kusakari', ...tables], options);
if (backup.status !== 0 || !backup.stdout.includes('INSERT INTO')) throw new Error('Backup failed; import cancelled.');
writeFileSync(join(backupDirectory, 'catalog-before.sql'), backup.stdout, { mode: 0o600 });
writeFileSync(join(backupDirectory, 'counts-before.txt'), before);
const literal = (value) => value == null ? 'NULL' : typeof value === 'boolean' ? String(Number(value))
  : typeof value === 'number' ? String(value) : value === '' ? "''" : `CONVERT(0x${Buffer.from(String(value), 'utf8').toString('hex')} USING utf8mb4)`;
const fields = ['id', 'sku', 'name', 'latinName', 'category', 'description', 'sizeLabel', 'care', 'priceYen', 'unit', 'imageUrl', 'badge',
  'source', 'sourceUpdatedAt', 'nurseryName', 'nurseryAddress', 'sunlight', 'useCase', 'careLevel', 'minTemperatureC',
  'heatTolerant', 'droughtTolerant', 'ageYears', 'heightCm', 'potDiameterCm', 'familyName', 'floweringDescription',
  'seasonalCare', 'styleDescription', 'publishedAt', 'active', 'plantModelProfile', 'modelComposition'];
const columns = fields.map((name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
const statements = ["SET time_zone='+00:00'; START TRANSACTION; SELECT id FROM products FOR UPDATE; UPDATE products SET active=FALSE;"];
for (const product of products) {
  const values = fields.map((field) => {
    let value = product[field];
    if (['plantModelProfile', 'modelComposition'].includes(field)) value = JSON.stringify(value);
    if (['sourceUpdatedAt', 'publishedAt'].includes(field)) value = new Date(value).toISOString().slice(0, 19).replace('T', ' ');
    return literal(value);
  });
  const id = literal(product.id);
  // Reject a SKU owned by a different ID instead of allowing an ambiguous upsert.
  const conflicts = sql(`SELECT COUNT(*) FROM products WHERE sku=${literal(product.sku)} AND id<>${id};`);
  if (conflicts !== '0') throw new Error('SKU conflict; import cancelled before transaction.');
  statements.push(`INSERT INTO products (${columns.join(',')}) VALUES (${values.join(',')}) ON DUPLICATE KEY UPDATE ${columns.filter((column) => column !== 'id').map((column) => `${column}=VALUES(${column})`).join(',')};`);
  statements.push(`INSERT INTO inventory(store_id,product_id,quantity) VALUES(1,${id},${product.stock}) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity);`);
  statements.push(`DELETE FROM product_images WHERE product_id=${id}; DELETE FROM material_products WHERE product_id=${id};`);
  product.images.forEach((url, index) => statements.push(`INSERT INTO product_images VALUES(${id},${index},${literal(url)});`));
}
for (const link of links) statements.push(`INSERT INTO material_products(material_code,product_id) VALUES(${literal(link.materialCode)},${literal(link.productId)});`);
statements.push('COMMIT;');
sql(statements.join('\n'));
const after = sql('SELECT COUNT(*),SUM(active) FROM products; SELECT COUNT(*) FROM cart_items; SELECT COUNT(*) FROM orders; SELECT COUNT(*) FROM order_items;');
writeFileSync(join(backupDirectory, 'counts-after.txt'), after);
console.log(`Import committed. Counts after:\n${after}\nBackup: ${backupDirectory}`);
