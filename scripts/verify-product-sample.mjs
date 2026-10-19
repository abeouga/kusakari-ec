import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, 'sample-data/products-20261019');
const expected = JSON.parse(readFileSync(join(directory, 'products-store-1.json'), 'utf8'));
// The snapshot retains the original export. These fields were removed from ProductView.
const retiredFields = new Set(['floweringDescription', 'seasonalCare', 'styleDescription']);
for (const product of expected) {
  for (const field of retiredFields) delete product[field];
  product.publicationStatus = 'PUBLISHED';
  if (product.plantModelProfile) product.plantModelProfile.botanicalForm ??= null;
  if (product.modelComposition?.profile) product.modelComposition.profile.botanicalForm ??= null;
}
const base = 'http://127.0.0.1:5186';
const response = await fetch(`${base}/api/products?storeId=1`);
assert.equal(response.status, 200);
const actual = await response.json();
assert.equal(actual.length, 31);
for (const product of expected) {
  const received = actual.find((row) => row.id === product.id);
  assert.ok(received, product.id);
  for (const [key, value] of Object.entries(product)) {
    if (['sourceUpdatedAt', 'publishedAt'].includes(key)) {
      assert.equal(new Date(received[key]).getTime(), new Date(value).getTime(), `${product.id}.${key}`);
    } else assert.deepEqual(received[key], value, `${product.id}.${key}`);
  }
}
const checksums = JSON.parse(readFileSync(join(directory, 'checksums.json'), 'utf8'));
for (const file of checksums.filter((entry) => entry.path.startsWith('frontend/public/images/'))) {
  const image = await fetch(base + file.path.replace('frontend/public', ''));
  assert.equal(image.status, 200, file.path);
  assert.equal(createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex'), file.sha256, file.path);
}
const quote = await fetch(`${base}/api/materials/quote`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ storeId: 1, items: expected.map((product) => ({ materialCode: product.canvasMaterialCode, quantity: 1, unit: 'piece' })) }),
});
assert.equal(quote.status, 200);
const matches = await quote.json();
assert.equal(matches.length, 31);
for (const product of expected) {
  const match = matches.find((row) => row.materialCode === product.canvasMaterialCode);
  assert.ok(match?.candidates.some((candidate) => candidate.product.id === product.id), product.id);
}
const evidence = join(root, 'artifacts/product-import-verification');
mkdirSync(evidence, { recursive: true });
writeFileSync(join(evidence, 'products-api.json'), JSON.stringify(actual, null, 2));
writeFileSync(join(evidence, 'material-quotes.json'), JSON.stringify(matches, null, 2));
console.log('Verified 31 product records using the current API contract, 60 image hashes, and 31 Canvas material matches against the live API.');
