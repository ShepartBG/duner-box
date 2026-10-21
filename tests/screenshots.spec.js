// Генерира screenshots за визуален преглед: npm run screenshots
const { test } = require('@playwright/test');

test.describe.configure({ timeout: 120000 });

async function prep(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-in')));
  await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.waitForTimeout(800);
}

test('screenshots', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-10-12T08:30:00+03:00'));
  await page.goto('/');
  await prep(page);
  const p = testInfo.project.name;
  await page.screenshot({ path: `screenshots/${p}-full.png`, fullPage: true });
  await page.screenshot({ path: `screenshots/${p}-top.png` });

  const { w, h } = await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
  const step = p === 'mobile' ? 1300 : 1100;
  for (let y = 0, n = 0; y < h; y += step, n++) {
    await page.screenshot({ path: `screenshots/parts/${p}-${n}.png`, fullPage: true, clip: { x: 0, y, width: w, height: Math.min(step, h - y) } });
  }

  if (p === 'mobile') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.burger').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `screenshots/${p}-nav.png` });
  }
});

test('screenshots: отворени поръчки с пълна количка', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-10-12T09:41:00+03:00'));
  await page.goto('/');
  await prep(page);
  await page.locator('[data-product="duner-royal"] [data-add]').click();
  await page.locator('[data-product="duner-royal"] [data-add]').click();
  await page.locator('#shop-tab-box').click();
  await page.locator('[data-product="box-large"] [data-add]').click();
  await page.locator('#shop-tab-drinks').click();
  await page.locator('[data-product="drink-cola"] [data-add]').click();
  await page.fill('#f-name', 'Иван Петров');
  await page.fill('#f-phone', '0888 123 456');
  await page.fill('#f-email', 'ivan@example.com');
  await page.waitForTimeout(2200);
  const p = testInfo.project.name;
  await page.locator('#order').screenshot({ path: `screenshots/${p}-order-open.png` });
});
