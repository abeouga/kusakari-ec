import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, canvas, call, login, prepareMember, productInput } from './business-helpers.js';
import { sql } from './database.js';
import { MANAGER_EMAIL, USER_EMAIL } from './test-accounts.js';

const evidence = 'artifacts/business/shopping-list-removed-candidates';

// A garden placed with an old Canvas model (bench_wood) lists the products tied to its material code (garden.bench).
// Products that can never be bought again (deleted here; canvas-bench was deleted by V7) are not offered as candidates,
// while a temporarily unbuyable one (hidden) stays as an unbuyable candidate.
test('material-code candidates of the shopping list leave out deleted products', async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  const [sellerContext, buyerContext] = await Promise.all([browser.newContext(), browser.newContext()]);
  const seller = await sellerContext.newPage();
  const buyer = await buyerContext.newPage();
  prepareMember(await login(seller, MANAGER_EMAIL), 'SELLER');
  prepareMember(await login(buyer, USER_EMAIL), 'USER');
  const products = {};
  let garden;
  try {
    for (const key of ['kept', 'hidden', 'deleted']) {
      const name = `ベンチ候補 ${key} ${randomUUID().slice(0, 8)}`;
      const response = await call(seller.request, '/products', 'POST', { ...productInput(), name, storeId: 1 });
      expect(response.status(), await response.text()).toBe(200);
      products[key] = await response.json();
    }
    const ids = Object.values(products).map((p) => p.id);
    sql(
      ids
        .map((id) => `INSERT INTO material_products(material_code,product_id) VALUES('garden.bench','${id}');`)
        .join(''),
    );
    const hide = { storeId: 1, productIds: [products.hidden.id], status: 'HIDDEN' };
    expect((await call(seller.request, '/seller/products/status', 'PATCH', hide)).status()).toBe(200);
    expect((await call(seller.request, `/products/${products.deleted.id}`, 'DELETE')).status()).toBe(200);

    const created = await call(
      buyer.request,
      '/gardens',
      'POST',
      { name: `ベンチ候補 ${randomUUID().slice(0, 8)}` },
      canvas,
    );
    expect(created.status()).toBe(201);
    garden = await created.json();
    const bench = {
      id: randomUUID(),
      assetId: 'bench_wood',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const saved = await call(buyer.request, `/gardens/${garden.id}`, 'PUT', { ...garden, objects: [bench] }, canvas);
    expect(saved.status(), await saved.text()).toBe(200);

    const list = await call(buyer.request, `/shopping-lists/${garden.id}`).then((r) => r.json());
    await writeFile(`${evidence}/shopping-list.json`, JSON.stringify(list, null, 2));
    const line = list.items.find((item) => item.key === 'asset:bench_wood');
    const candidates = Object.fromEntries(line.products.map((p) => [p.id, p.active]));
    expect(candidates[products.kept.id]).toBe(true);
    expect(candidates[products.hidden.id]).toBe(false);
    expect(Object.keys(candidates)).not.toContain(products.deleted.id);
    expect(Object.keys(candidates)).not.toContain('canvas-bench');

    // The buyer's purchase-product choice shows the same candidates.
    await buyer.goto(`${ec}/cart?garden=${garden.id}`);
    const choice = buyer.getByRole('combobox', { name: 'ベンチの購入商品', exact: true });
    await expect(choice).toBeVisible();
    const options = await choice.locator('option').allTextContents();
    expect(options.some((text) => text.includes(products.kept.name))).toBeTruthy();
    expect(options.some((text) => text.includes(products.deleted.name))).toBeFalsy();
    expect(options.some((text) => text.includes('木製ガーデンベンチ'))).toBeFalsy();
    await buyer.screenshot({ path: `${evidence}/purchase-choice.png`, fullPage: true });
    await buyer.reload();
    await expect(choice).toBeVisible();
    expect(
      (await choice.locator('option').allTextContents()).some((t) => t.includes(products.deleted.name)),
    ).toBeFalsy();
    await buyer.screenshot({ path: `${evidence}/purchase-choice-reloaded.png`, fullPage: true });
  } finally {
    const ids = Object.values(products).map((p) => `'${p.id}'`);
    if (ids.length)
      sql(`DELETE FROM material_products WHERE material_code='garden.bench' AND product_id IN (${ids.join(',')});`);
    for (const key of ['kept', 'hidden'])
      if (products[key]) await call(seller.request, `/products/${products[key].id}`, 'DELETE');
    if (garden) await call(buyer.request, `/gardens/${garden.id}`, 'DELETE', undefined, canvas);
    await Promise.all([sellerContext.close(), buyerContext.close()]);
  }
});
