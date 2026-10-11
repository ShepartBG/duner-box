// Генерира screenshots за визуален преглед: npx playwright test tests/screenshots.spec.js
const { test } = require('@playwright/test');

test('screenshots', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+03:00'));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  // показваме всички анимирани елементи
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-in')));
  await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.waitForTimeout(800);
  const p = testInfo.project.name;
  await page.screenshot({ path: `screenshots/${p}-full.png`, fullPage: true });
  await page.screenshot({ path: `screenshots/${p}-top.png` });

  // на части, за по-лесен преглед
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
