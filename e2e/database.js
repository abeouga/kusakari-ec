import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { e2eDatabasePort, importRuntimeTools } from '../scripts/runtime-tools.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const tools = importRuntimeTools(process.cwd());

/** The mysql client, its arguments and environment for the dedicated E2E database (kusakari_e2e). */
function client() {
  const executable = process.env.MYSQL_CLIENT || (tools.MySql ? join(tools.MySql, 'mysql.exe') : 'mysql');
  const args = [
    '-h',
    '127.0.0.1',
    '-P',
    String(e2eDatabasePort()),
    '-u',
    process.env.KUSAKARI_EC_DB_USER,
    '--default-character-set=utf8mb4',
    '--batch',
    '--skip-column-names',
    'kusakari_e2e',
  ];
  return { executable, args, env: { ...process.env, MYSQL_PWD: process.env.KUSAKARI_EC_DB_PASSWORD } };
}

// Only test-owned fixtures and replenishment of purchases made by these tests are allowed.
export function sql(statement) {
  const { executable, args, env } = client();
  const result = spawnSync(executable, args, { input: statement, encoding: 'utf8', env });
  if (result.status !== 0) throw new Error(`E2E database operation failed: ${result.error?.message || result.stderr}`);
  return result.stdout.trim();
}

/**
 * Runs statements in a session of their own without waiting for them, so a test can hold a row lock while the API
 * works on the same row (issue #204). Resolves with the output once the session ends.
 * @param {string} statement
 * @returns {Promise<string>}
 */
export function sqlInBackground(statement) {
  const { executable, args, env } = client();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env });
    let output = '';
    let errors = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (output += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (errors += chunk));
    child.on('error', reject);
    child.on('close', (status) =>
      status === 0 ? resolve(output.trim()) : reject(new Error(`E2E database operation failed: ${errors}`)),
    );
    child.stdin.end(statement);
  });
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
      `UPDATE inventory SET quantity=quantity+${line.quantity} WHERE product_id=${literal(line.productId)};`,
    );
  }
}

export function createScarceProduct() {
  const id = `test-${randomUUID().slice(0, 8)}`;
  // A product belongs to one store (store 1 here); a new inventory row is hidden unless it says otherwise.
  sql(`INSERT INTO products(id,store_id,sku,name,latin_name,category_name,description,size_label,care,price_yen,image_url,badge)
    SELECT ${literal(id)},1,${literal(id)},'Concurrency fixture',latin_name,category_name,description,size_label,care,1200,image_url,badge FROM products WHERE id='olive';
    INSERT INTO inventory(product_id,quantity,publication_status) VALUES(${literal(id)},1,'PUBLISHED');`);
  return id;
}

export function removeScarceProduct(id) {
  if (!id.startsWith('test-')) throw new Error('Refusing non-test fixture deletion.');
  // Delete only orders containing the unique fixture; these never contain ordinary products.
  const orders = sql(`SELECT order_id FROM order_items WHERE product_id=${literal(id)};`)
    .split(/\r?\n/)
    .filter(Boolean);
  sql(`DELETE FROM order_items WHERE product_id=${literal(id)};
    ${orders.map((order) => `DELETE FROM orders WHERE id=${literal(order)};`).join('\n')}
    DELETE FROM cart_items WHERE product_id=${literal(id)};
    DELETE FROM inventory WHERE product_id=${literal(id)};
    DELETE FROM products WHERE id=${literal(id)};`);
}
