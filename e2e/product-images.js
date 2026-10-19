import { expect } from '@playwright/test';
export async function addImages(form, files = ['frontend/public/images/plant-photo-split-leaf.png']) {
  const count = await form.locator('.product-image-tile').count();
  await form.getByLabel('商品画像を追加', { exact: true }).setInputFiles(files);
  await expect(form.locator('.product-image-tile')).toHaveCount(count + files.length);
  await expect(form.getByLabel('商品画像を追加', { exact: true })).toBeEnabled();
}
