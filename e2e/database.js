import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { e2eDatabasePort, importRuntimeTools } from '../scripts/runtime-tools.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const tools = importRuntimeTools(process.cwd());

// Only test-owned fixtures and replenishment of purchases made by these tests are allowed.
export function sql(statement) {
  const port = e2eDatabasePort();
  const executable = process.env.MYSQL_CLIENT || (tools.MySql ? join(tools.MySql, 'mysql.exe') : 'mysql');
  const result = spawnSync(
    executable,
    [
      '-h',
      '127.0.0.1',
      '-P',
      String(port),
      '-u',
      process.env.KUSAKARI_EC_DB_USER,
      '--default-character-set=utf8mb4',
      '--batch',
      '--skip-column-names',
      'kusakari_e2e',
    ],
    {
      input: statement,
      encoding: 'utf8',
      env: { ...process.env, MYSQL_PWD: process.env.KUSAKARI_EC_DB_PASSWORD },
    },
  );
  if (result.status !== 0) throw new Error(`E2E database operation failed: ${result.error?.message || result.stderr}`);
  return result.stdout.trim();
}

function literal(value) {
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(value)) throw new Error('Unexpected fixture identifier.');
  return `'${value}'`;
}

export function replenishOrder(order, storeId) {
  if (![1, 2, 3].includes(storeId)) throw new Error('Unexpected store.');
  for (const line of order.items) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99)
      throw new Error('Unexpected quantity.');
    sql(
      `UPDATE inventory SET quantity=quantity+${line.quantity} WHERE product_id=${literal(line.productId)} AND store_id=${storeId};`,
    );
  }
}

export function createScarceProduct() {
  const id = `test-${randomUUID().slice(0, 8)}`;
  sql(`INSERT INTO products(id,sku,name,latin_name,category,description,size_label,care,price_yen,image_url,badge)
    SELECT ${literal(id)},${literal(id)},'Concurrency fixture',latin_name,category,description,size_label,care,1200,image_url,badge FROM products WHERE id='olive';
    INSERT INTO inventory(store_id,product_id,quantity) VALUES(1,${literal(id)},1);`);
  return id;
}

export function removeScarceProduct(id) {
  if (!id.startsWith('test-')) throw new Error('Refusing non-test fixture deletion.');
  // Delete only orders containing the unique fixture; these never contain ordinary products.
  const orders = sql(`SELECT order_id FROM order_items WHERE product_id=${literal(id)};`)
    .split(/\r?\n/)
    .filter(Boolean);
  sql(`DELETE FROM order_items WHERE product_id=${literal(id)};
    ${orders.map((order) => `DELETE FROM order_details WHERE order_id=${literal(order)}; DELETE FROM orders WHERE id=${literal(order)};`).join('\n')}
    DELETE FROM cart_items WHERE product_id=${literal(id)};
    DELETE FROM inventory WHERE product_id=${literal(id)};
    DELETE FROM products WHERE id=${literal(id)};`);
}
