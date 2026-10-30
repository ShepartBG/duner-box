// Панелът за поръчки в браузъра (dunerbox.bg/admin) — на компютър и на телефон
const { test, expect } = require('@playwright/test');

const NOW = '2026-10-12T09:30:00+03:00'; // понеделник, поръчките са отворени
const uniq = () => `Тест ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function placeOrder(request, name) {
  const r = await request.post('/api/order', {
    headers: { 'x-test-now': NOW },
    data: {
      name, phone: '0888 111 222', email: 'test@example.com', notes: 'Корпус 2, етаж 3', consent: true, aec: true,
      items: [{ id: 'duner-large', size: 0, qty: 2, opts: { sauces: ['люто'] } }, { id: 'drink-ayran', size: 0, qty: 1 }],
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).orderId;
}

async function login(page) {
  await page.goto('/admin');
  await page.fill('#pw', 'test-admin');
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page.locator('[data-app]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW));
});

test('панел: вход с парола, грешната парола не пуска', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.locator('[data-login]')).toBeVisible();
  await expect(page.locator('[data-app]')).toBeHidden();
  await page.fill('#pw', 'грешна');
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page.locator('[data-login-err]')).toHaveText('Грешна парола.');
  await page.fill('#pw', 'test-admin');
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page.locator('[data-app]')).toBeVisible();
  // остава влязъл след презареждане
  await page.reload();
  await expect(page.locator('[data-app]')).toBeVisible();
  await expect(page.locator('[data-win]')).toHaveClass(/is-open/);
  await expect(page.locator('[data-win-text]')).toContainText('Поръчките са отворени · още 00:30:00');
});

test('панел: приемам → доставена; клиентът и сумата се виждат', async ({ page, request }) => {
  const name = uniq();
  const id = await placeOrder(request, name);
  await login(page);
  const card = page.locator(`[data-order="${id}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('.badge')).toHaveText('Чака');
  await expect(card).toContainText(name);
  await expect(card).toContainText('Корпус 2, етаж 3');
  await expect(card).toContainText('сосове: люто');
  await expect(card.locator('.ord__total')).toContainText('11,50 €');
  await expect(card.locator('.ord__phone')).toHaveAttribute('href', 'tel:0888111222');
  await expect(page).toHaveTitle(/^\(\d+\) Нова поръчка/);

  // „Приемам“ иска второ натискане
  const accept = card.locator('[data-act="accept"]');
  await accept.click();
  await expect(accept).toHaveText('Натисни пак ✓');
  await accept.click();
  await expect(card.locator('.badge')).toHaveText('Приета');
  await expect(page.locator('[data-toast]')).toContainText('клиентът получи имейл');
  await expect(card.locator('.ord__info')).toContainText('доставка до');

  const delivered = card.locator('[data-act="delivered"]');
  await delivered.click();
  await delivered.click();
  await expect(card.locator('.badge')).toHaveText('Доставена');
  await expect(card.locator('[data-act]')).toHaveCount(0);
});

test('панел: отказ с бърза причина', async ({ page, request }) => {
  const id = await placeOrder(request, uniq());
  await login(page);
  const card = page.locator(`[data-order="${id}"]`);
  await card.locator('[data-act="decline"]').click();
  await expect(page.locator('[data-decline-dlg]')).toBeVisible();
  await page.getByRole('button', { name: 'Много поръчки в момента' }).click();
  await expect(page.locator('[data-decline-reason]')).toHaveValue('Много поръчки в момента');
  await page.locator('[data-decline-ok]').click();
  await expect(card.locator('.badge')).toHaveText('Отказана');
  await expect(card.locator('.ord__info')).toContainText('Много поръчки в момента');
});

test('панел: нова поръчка се появява сама и се показва известие', async ({ page, request }) => {
  await login(page);
  await expect(page.locator('[data-stats]')).toContainText('Чакат');
  const name = uniq();
  const id = await placeOrder(request, name);
  await page.locator('[data-refresh]').click(); // същото прави автоматичното обновяване на 10 сек.
  await expect(page.locator(`[data-order="${id}"]`)).toBeVisible();
  // другите тестове вървят паралелно — може да дойдат няколко наведнъж
  await expect(page.locator('[data-toast]')).toHaveText(new RegExp(`Нова поръчка от ${name}|\\d+ нови поръчки`));
});

test('панел: смяна на деня', async ({ page }) => {
  await login(page);
  await expect(page.locator('[data-day-label]')).toHaveText('Днес');
  await expect(page.locator('[data-day-next]')).toBeDisabled();
  await page.locator('[data-day-prev]').click();
  await expect(page.locator('[data-day-label]')).toHaveText('Вчера');
  await expect(page.locator('[data-empty]')).toBeVisible(); // 11.10 е неделя — няма поръчки
  await page.locator('[data-day-today]').click();
  await expect(page.locator('[data-day-label]')).toHaveText('Днес');
});

test('панел: изход', async ({ page }) => {
  await login(page);
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-logout]').click();
  await expect(page.locator('[data-login]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-login]')).toBeVisible();
});

test('панел: приложение за началния екран, без индексиране, без хоризонтален скрол', async ({ page, request }) => {
  const m = await request.get('/admin.webmanifest');
  expect(m.ok()).toBe(true);
  const manifest = await m.json();
  expect(manifest.start_url).toBe('/admin');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  await login(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
