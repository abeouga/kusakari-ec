import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ec, capture, login } from './business-helpers.js';

test.use({ trace: 'off' });

// Issue #63: "Canvasへ戻る" on the Canvas materials page has the same left arrow as the other back links.
test('materials page shows the arrow on the link back to Canvas', async ({ page }) => {
  const dir = 'artifacts/business/back-links';
  await mkdir(dir, { recursive: true });
  await login(page, 'test.user@example.com');
  const items = [{ materialCode: 'plant.olive', quantity: 1, unit: 'piece' }];
  await page.goto(`${ec}/materials#${new URLSearchParams({ 'canvas-items': JSON.stringify(items) })}`);
  await page.reload();
  const back = page.getByRole('link', { name: 'Canvasへ戻る', exact: true });
  const arrow = back.locator('svg.lucide-arrow-left');
  await expect(arrow).toBeVisible();
  await expect(arrow).toHaveAttribute('aria-hidden', 'true');
  // The arrow sits before the text on the same line, 6px away like .page-back-button.
  const layout = await back.evaluate((link) => {
    const icon = link.querySelector('svg').getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(link.lastChild);
    const text = range.getBoundingClientRect();
    return {
      gap: getComputedStyle(link).columnGap,
      iconBeforeText: icon.right <= text.left,
      sameLine: Math.abs(icon.top + icon.height / 2 - (text.top + text.height / 2)) < 4,
    };
  });
  expect(layout).toEqual({ gap: '6px', iconBeforeText: true, sameLine: true });
  await capture(page, `${dir}/materials-back-to-canvas.png`, back);
  await writeFile(`${dir}/materials-back-to-canvas.json`, JSON.stringify({ layout, items }, null, 2));
});
