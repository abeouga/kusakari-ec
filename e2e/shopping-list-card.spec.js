import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, canvas, login, call } from './business-helpers.js';

const evidence = 'artifacts/shopping-list-card';

// Issue #62: 庭の買い物リスト一覧は「開く」ボタンを持たず、カード全体が詳細へのリンクになる。
test('garden shopping list card opens the list from anywhere on the card and by keyboard', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await login(page, 'test.user@example.com');
  const created = await call(page.request, '/gardens', 'POST', { name: `カードリンク検証 ${randomUUID().slice(0, 8)}` }, canvas);
  expect(created.status()).toBe(201);
  const garden = await created.json();
  const detailPath = `/cart/gardens/${garden.id}`;
  const linkName = `${garden.name}の買い物リストを開く`;
  const detailHeading = page.getByRole('heading', { name: `${garden.name}の買い物リスト`, exact: true });

  await page.goto(`${ec}/cart#garden-shopping-lists`);
  const card = page.getByTestId(`garden-list-${garden.id}`);
  await expect(card).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '買い物リストを開く' })).toHaveCount(0);
  const link = card.getByRole('link', { name: linkName, exact: true });
  await expect(link).toHaveAttribute('href', detailPath);

  // サムネイルをクリックしてSPA遷移で詳細を開く。
  const marker = await page.evaluate(() => (window.__cardLinkMarker = Math.random()));
  await card.locator('.garden-list-thumbnail').click();
  await expect(page).toHaveURL(`${ec}${detailPath}`);
  await expect(detailHeading).toBeVisible();
  expect(await page.evaluate(() => window.__cardLinkMarker)).toBe(marker);

  // 説明文（更新日時の行）のクリックでも開く。
  await page.goto(`${ec}/cart#garden-shopping-lists`);
  await card.locator('.garden-list-description .fine-print').first().click();
  await expect(page).toHaveURL(`${ec}${detailPath}`);
  await expect(detailHeading).toBeVisible();

  // キーボード: Tabでカードへ移動し、フォーカス表示を確認してEnterで開く。
  await page.goto(`${ec}/cart#garden-shopping-lists`);
  await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  let focused = false;
  for (let i = 0; i < 80 && !focused; i += 1) {
    await page.keyboard.press('Tab');
    focused = await link.evaluate((el) => el === document.activeElement);
  }
  expect(focused).toBeTruthy();
  expect(await link.evaluate((el) => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none')).toBeTruthy();
  await page.screenshot({ path: `${evidence}/card-focus.png` });
  await link.hover();
  await page.screenshot({ path: `${evidence}/card-hover.png` });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${ec}${detailPath}`);
  await expect(detailHeading).toBeVisible();

  // 再読み込み後の一覧と、モバイル幅でボタン用の列がなく横スクロールしないことを保存する。
  await page.goto(`${ec}/cart#garden-shopping-lists`);
  await page.reload();
  await expect(link).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidence}/lists-after-reload.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(link).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidence}/lists-mobile.png` });

  const lists = await call(page.request, '/shopping-lists').then((r) => r.json());
  const listed = lists.find((list) => list.gardenId === garden.id);
  expect(listed).toBeTruthy();
  await writeFile(`${evidence}/api-shopping-list.json`, JSON.stringify(listed, null, 2));
});
