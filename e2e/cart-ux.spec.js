import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const ids = ['silver-tree','conifer','round-shrub','herb-shrub','pink-flower','white-flower'].map(id => 'garden-demo-' + id);
const canvas = 'http://127.0.0.1:15173';
const api = 'http://127.0.0.1:18081/api';
const evidence = 'artifacts/e2e/cart-ux';

test('seeded products render, drag, persist and transfer through accessible cart segments', async ({ page, request }) => {
  test.setTimeout(150000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir(evidence, {recursive:true});
  const products = await request.get('/api/products?storeId=1').then(r => r.json());
  const added = products.filter(p => ids.includes(p.id));
  expect(added).toHaveLength(6);
  for (const product of added) {
    expect(product.modelComposition.parts.length).toBeGreaterThan(100);
    expect(product.plantModelProfile).toEqual(product.modelComposition.profile);
    expect((await request.get(product.imageUrl)).ok()).toBeTruthy();
  }
  const garden = await request.post(api + '/gardens', {data:{name:'商品展示の検証-' + randomUUID().slice(0,8),width:12,depth:10}}).then(r => r.json());
  try {
    await page.goto(canvas + '/gardens/' + garden.id, {waitUntil:'domcontentloaded'});
    await page.getByRole('button', {name:'上から見る',exact:true}).click();
    const target = page.getByTestId('garden-canvas').locator('canvas');
    for (const [index,id] of ids.entries()) {
      const card = page.getByTestId('browse-' + id);
      await card.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      await card.dragTo(target,{sourcePosition:{x:30,y:30},targetPosition:{x:box.width*(0.28+(index%3)*0.21),y:box.height*(0.35+Math.floor(index/3)*0.28)}});
      await expect(page.getByTestId('model-loaded')).toHaveText(`読み込み済み: ${index+1} / ${index+1}`);
      await expect(page.getByTestId('save-status')).toHaveText('保存済み');
    }
    await page.getByRole('button', {name:'初期視点',exact:true}).click();
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.getByTestId('model-loaded')).toHaveText('読み込み済み: 6 / 6');
    const saved = await request.get(api + '/gardens/' + garden.id).then(r=>r.json());
    expect(saved.objects.map(o=>o.productId).sort()).toEqual([...ids].sort());
    for (const object of saved.objects) expect(object.modelComposition).toEqual(added.find(p=>p.id===object.productId).modelComposition);
    await writeFile(evidence+'/garden-after-reload.json',JSON.stringify(saved,null,2));
    await page.screenshot({path:evidence+'/six-models-after-reload.png'});
    await expect.poll(async () => (await request.get(api+'/gardens/'+garden.id+'/thumbnail')).headers()['x-thumbnail-source']).toBe('scene');
    await page.getByRole('tab',{name:/買い物リスト/}).click();
    await page.getByRole('button',{name:'ECで買い物リストを確認',exact:true}).click();
    await expect(page.getByRole('tab',{name:'庭の買い物リスト',exact:true})).toHaveAttribute('aria-selected','true');
    await expect(page.locator('.kusakari-site-header')).toHaveCount(1);
    await expect(page.getByRole('checkbox')).toHaveCount(6);
    await page.getByRole('button',{name:'全選択',exact:true}).click();
    await page.getByRole('button',{name:'選択した商品をカートに追加',exact:true}).click();
    await expect(page.getByRole('tab',{name:/^カート/})).toHaveAttribute('aria-selected','true');
    await expect(page.locator('.cart-line')).toHaveCount(6);
    await expect(page.getByTestId('garden-list-'+garden.id)).toHaveCount(0);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.cart-line')).toHaveCount(6);
    await expect(page.getByRole('button',{name:'注文内容を確認する',exact:true})).toBeEnabled();
    await page.screenshot({path:evidence+'/cart-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'ログイン',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button',{name:'閉じる',exact:true}).click();
    await page.getByRole('tab',{name:/^カート/}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab',{name:'庭の買い物リスト',exact:true})).toBeFocused();
    await expect(page.getByTestId('garden-list-'+garden.id)).toContainText('必要数 6点');
    await expect(page.locator('.cart-line')).toHaveCount(0);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.getByRole('tab',{name:'庭の買い物リスト',exact:true})).toHaveAttribute('aria-selected','true');
    await page.screenshot({path:evidence+'/lists-desktop.png',fullPage:true});
    await page.getByRole('tab',{name:/^カート/}).click();
    await page.goBack();
    await expect(page.getByRole('tab',{name:'庭の買い物リスト',exact:true})).toHaveAttribute('aria-selected','true');
    await page.setViewportSize({width:390,height:844});
    for (const tab of ['カート','庭の買い物リスト']) {
      await page.getByRole('tab',{name:new RegExp('^'+tab)}).click();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
      await page.screenshot({path:evidence+(tab==='カート'?'/cart-mobile.png':'/lists-mobile.png'),fullPage:true});
    }
    const cart = await page.request.get('/api/cart').then(r=>r.json());
    await writeFile(evidence+'/cart-after-reload.json',JSON.stringify(cart,null,2));
    expect(cart.items).toHaveLength(6);
    expect(errors).toEqual([]);
  } finally { await request.delete(api+'/gardens/'+garden.id); }
});
