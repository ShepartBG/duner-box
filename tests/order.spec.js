const { test, expect } = require('@playwright/test');

// Понеделник, 12.10.2026
const AT = (hm) => new Date(`2026-10-12T${hm}:00+03:00`);


/* Добавя храна през прозореца „Направи си го“ */
async function addFood(page, id, { size, all, ingredients = [], sauces = [], extras = [], qty = 1 } = {}) {
  const cat = await page.evaluate((x) => window.DUNER.MENU.find((m) => m.id === x).cat, id);
  await page.locator(`#shop-tab-${cat}`).click();
  await page.locator(`[data-product="${id}"] [data-add]`).click();
  const d = page.locator('[data-builder]');
  await expect(d).toBeVisible();
  if (size != null) await d.locator(`[data-b-size="${size}"]`).click();
  if (all) await d.locator('[data-b-all]').click();
  for (const v of [...ingredients, ...sauces, ...extras]) await d.locator(`label.opt:has(input[value="${v}"])`).click();
  for (let i = 1; i < qty; i++) await d.locator('[data-b-step="1"]').click();
  await d.locator('[data-b-add]').click();
  await expect(d).toBeHidden();
}

async function fillForm(page, { name = 'Иван Петров', phone = '0888 123 456', email = 'ivan@example.com', notes = 'Сграда 2, без лук', consent = true } = {}) {
  await page.fill('#f-name', name);
  await page.fill('#f-phone', phone);
  await page.fill('#f-email', email);
  await page.fill('#f-notes', notes);
  if (consent) await page.locator('[name="aec"]').check();
  if (consent) await page.locator('[name="consent"]').check();
}

/* Изпраща заявките към API-то с фалшив „сега“, за да може сървърът да приеме поръчката */
async function routeWithClock(page, iso) {
  const bodies = [];
  await page.route('**/api/order', async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.continue({ headers: { ...route.request().headers(), 'x-test-now': iso } });
  });
  return bodies;
}

test.describe('Поръчки за АЕЦ', () => {
  test('таймерът показва колко остава до отварянето', async ({ page }) => {
    await page.clock.setFixedTime(AT('08:15'));
    await page.goto('/');
    await expect(page.locator('[data-timer]')).not.toHaveClass(/is-open/);
    await expect(page.locator('[data-timer-label]')).toHaveText('Поръчките отварят след');
    await expect(page.locator('[data-timer-digits]')).toHaveText('00:45:00');
    await expect(page.locator('[data-timer-sub]')).toHaveText('днес в 9:00');
    await expect(page.locator('[data-mini-timer-text]')).toHaveText('Поръчки за АЕЦ след 00:45:00');
  });

  test('таймерът брои надолу всяка секунда', async ({ page }) => {
    await page.clock.install({ time: AT('08:58') });
    await page.goto('/');
    await page.clock.pauseAt(AT('08:59'));
    await expect(page.locator('[data-timer-digits]')).toHaveText('00:01:00');
    await page.clock.fastForward(5000);
    await expect(page.locator('[data-timer-digits]')).toHaveText('00:00:55');
    await page.clock.fastForward(55000);
    await expect(page.locator('[data-timer]')).toHaveClass(/is-open/);
    await expect(page.locator('[data-timer-label]')).toHaveText('Поръчай сега! Затваряме след');
  });

  test('в 9:30 поръчките са отворени и таймерът брои до затваряне', async ({ page }) => {
    await page.clock.setFixedTime(AT('09:30'));
    await page.goto('/');
    await expect(page.locator('[data-timer]')).toHaveClass(/is-open/);
    await expect(page.locator('[data-timer-digits]')).toHaveText('00:30:00');
    await expect(page.locator('[data-timer-sub]')).toHaveText('Приемаме поръчки до 10:00');
  });

  test('в петък след 10:00 таймерът сочи понеделник', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-16T10:00:00+03:00'));
    await page.goto('/');
    await expect(page.locator('[data-timer-sub]')).toHaveText('в понеделник в 9:00');
    await expect(page.locator('[data-timer-digits]')).toHaveText('2 д 23:00:00');
  });

  test('условията за поръчка са ясно видими', async ({ page }) => {
    await page.goto('/');
    const rules = page.locator('.rules');
    await rules.scrollIntoViewIfNeeded();
    await expect(rules.locator('.rules__main')).toBeVisible();
    await expect(rules.locator('.rules__main')).toContainText('само от 9:00 до 10:00');
    await expect(rules).toContainText('само в АЕЦ Козлодуй');
    await expect(rules).toContainText('до 30 минути');
    await expect(rules).toContainText('само в брой');
  });

  test('магазин: добавяне, размери, количества и общо', async ({ page }) => {
    await page.clock.setFixedTime(AT('09:30'));
    await page.goto('/');
    await addFood(page, 'duner-royal', { all: true, sauces: ['чеснов'], qty: 2 });
    await addFood(page, 'sand-tarikatski', { size: 1, extras: ['extra-kofte'] });
    await page.locator('#shop-tab-drinks').click();
    await page.locator('[data-product="drink-cola"] [data-add]').click();

    const lines = page.locator('[data-cart-list] .cart__line');
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toContainText('Дюнер кралски');
    await expect(lines.nth(0)).toContainText('със всичко · сосове: чеснов');
    await expect(lines.nth(0).locator('[data-qty-val]')).toHaveText('2');
    await expect(lines.nth(1)).toContainText('Тарикатски (голям)');
    await expect(lines.nth(1)).toContainText('+ телешко кюфте');
    await expect(lines.nth(1)).toContainText('8,00 € / бр.');
    await expect(page.locator('[data-cart-total]')).toHaveText('25,50 €'); // 2 × 8 + (6 + 2) + 1,50
    await expect(page.locator('[data-cart-unpriced]')).toBeHidden();

    await lines.nth(0).locator('[data-qty="-1"]').click();
    await expect(page.locator('[data-cart-total]')).toHaveText('17,50 €');
    await lines.nth(2).locator('[data-qty="-1"]').click();
    await expect(lines).toHaveCount(2);

    // количката се помни след презареждане
    await page.reload();
    await expect(page.locator('[data-cart-list] .cart__line')).toHaveCount(2);
    await page.locator('[data-cart-clear]').click();
    await expect(page.locator('[data-cart-empty]')).toBeVisible();
  });

  test('напитки: избор на вкус и размер, отделни редове в количката', async ({ page }) => {
    await page.clock.setFixedTime(AT('09:30'));
    await page.goto('/');
    await page.locator('#shop-tab-drinks').click();
    const q = page.locator('[data-product="drink-queens"]');
    await q.locator('[data-flavor]').selectOption('малина');
    await q.locator('[data-add]').click();
    await q.locator('[data-flavor]').selectOption('манго');
    await q.locator('[data-add]').click();
    await q.locator('[data-add]').click();
    const v = page.locator('[data-product="drink-velingrad"]');
    await v.locator('[data-size-pick="1"]').click();
    await v.locator('[data-add]').click();
    const lines = page.locator('[data-cart-list] .cart__line');
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toContainText('Куинс (малина)');
    await expect(lines.nth(1)).toContainText('Куинс (манго)');
    await expect(lines.nth(1).locator('[data-qty-val]')).toHaveText('2');
    await expect(lines.nth(2)).toContainText('Велинград (1,5 л)');
    await expect(page.locator('[data-cart-total]')).toHaveText('5,50 €');
  });

  test('„Направи си го“: „Със всичко“, махане на съставка, добавки и цена', async ({ page }) => {
    await page.clock.setFixedTime(AT('09:30'));
    await page.goto('/');
    await page.locator('[data-product="duner-large"] [data-add]').click();
    const d = page.locator('[data-builder]');
    await expect(d).toBeVisible();
    await expect(d.locator('#bld-title')).toHaveText('Дюнер голям');
    await expect(d.locator('input[name="ingredients"]:checked')).toHaveCount(0);
    await expect(d.locator('[data-b-total]')).toHaveText('5,00 €');

    await d.locator('[data-b-all]').click();
    await expect(d.locator('input[name="ingredients"]:checked')).toHaveCount(9);
    await expect(d.locator('[data-b-all]')).toHaveText('✕ Махни всички');
    await d.locator('label.opt:has(input[value="лук пресен"])').click();
    await expect(d.locator('input[name="ingredients"]:checked')).toHaveCount(8);
    await expect(d.locator('[data-b-all]')).toHaveText('✓ Със всичко');

    await d.locator('label.opt:has(input[value="extra-kofte"])').click();
    await d.locator('label.opt:has(input[value="extra-bacon"])').click();
    await expect(d.locator('[data-b-total]')).toHaveText('8,00 €'); // 5 + 2 + 1
    await d.locator('[data-b-step="1"]').click();
    await expect(d.locator('[data-b-total]')).toHaveText('16,00 €');
    await d.locator('[data-b-add]').click();

    const line = page.locator('[data-cart-list] .cart__line');
    await expect(line).toHaveCount(1);
    await expect(line).toContainText('всичко без лук пресен');
    await expect(line).toContainText('+ телешко кюфте, + бекон');
    await expect(page.locator('[data-cart-total]')).toHaveText('16,00 €');

    // същият избор се събира в един ред, различен избор е нов ред
    await addFood(page, 'duner-large');
    await expect(line).toHaveCount(2);
  });

  test('„Направи си го“: размер, затваряне с Esc и без съставки за гарнитурите', async ({ page }) => {
    await page.goto('/');
    await page.locator('#shop-tab-sandwich').click();
    await page.locator('[data-product="sand-pacific"] [data-add]').click();
    const d = page.locator('[data-builder]');
    await d.locator('[data-b-size="1"]').click();
    await expect(d.locator('[data-b-total]')).toHaveText('5,50 €');
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(page.locator('[data-cart-list] .cart__line')).toHaveCount(0);

    await page.locator('#shop-tab-sides').click();
    await page.locator('[data-product="side-fries"] [data-add]').click();
    await expect(d.locator('[data-b-group="sauces"]')).toBeVisible();
    await expect(d.locator('[data-b-group="ingredients"]')).toHaveCount(0);
    await expect(d.locator('[data-b-group="extras"]')).toHaveCount(0);
    await d.locator('[data-b-close]').click();
    await expect(d).toBeHidden();

    // напитките се добавят директно, без прозорец
    await page.locator('#shop-tab-drinks').click();
    await page.locator('[data-product="drink-ayran"] [data-add]').click();
    await expect(d).toBeHidden();
    await expect(page.locator('[data-cart-list] .cart__line')).toHaveCount(1);
    // добавките не са отделен раздел в магазина
    await expect(page.locator('#shop-tab-extras')).toHaveCount(0);
  });

  test('извън 9:00–10:00 бутонът за изпращане е заключен', async ({ page }) => {
    await page.clock.setFixedTime(AT('10:30'));
    await page.goto('/');
    await addFood(page, 'duner-small');
    await fillForm(page);
    await expect(page.locator('[data-submit]')).toBeDisabled();
    await expect(page.locator('[data-closed-note]')).toHaveText(/9:00 до 10:00/);
  });

  test('празна количка не може да се изпрати', async ({ page }) => {
    await page.clock.setFixedTime(AT('09:30'));
    await page.goto('/');
    await expect(page.locator('[data-submit]')).toBeDisabled();
    await expect(page.locator('[data-closed-note]')).toHaveText('Добави поне едно нещо в количката.');
  });

  test('задължителните полета се проверяват', async ({ page }) => {
    await page.clock.setFixedTime(AT('09:30'));
    await page.goto('/');
    await addFood(page, 'duner-small');
    await fillForm(page, { name: '', phone: '123', email: 'не-е-имейл', consent: false });
    await page.locator('[data-submit]').click();
    await expect(page.locator('[data-err="name"]')).toHaveText('Въведи имената си.');
    await expect(page.locator('[data-err="phone"]')).toHaveText('Въведи валиден телефон.');
    await expect(page.locator('[data-err="email"]')).toHaveText('Въведи валиден имейл.');
    await expect(page.locator('[data-err="consent"]')).not.toBeEmpty();
    await expect(page.locator('[data-err="aec"]')).toHaveText('Потвърди, че доставката е в АЕЦ Козлодуй.');
    await expect(page.locator('#f-name')).toBeFocused();
    await expect(page.locator('[data-done]')).toBeHidden();
  });

  test('успешна поръчка в 9:30 стига до сървъра и показва потвърждение', async ({ page }) => {
    await page.clock.setFixedTime(AT('09:30'));
    const bodies = await routeWithClock(page, '2026-10-12T09:30:00+03:00');
    await page.goto('/');
    await addFood(page, 'duner-royal', { all: true, sauces: ['люто'] });
    await addFood(page, 'box-large');
    await page.locator('#shop-tab-drinks').click();
    await page.locator('[data-product="drink-hell"] [data-flavor]').selectOption('диня');
    await page.locator('[data-product="drink-hell"] [data-add]').click();
    await fillForm(page);
    await expect(page.locator('[data-submit]')).toBeEnabled();
    await expect(page.locator('[data-submit-total]')).toHaveText('· 15,50 €');
    await page.locator('[data-submit]').click();

    await expect(page.locator('[data-done]')).toBeVisible();
    await expect(page.locator('[data-done-id]')).toHaveText(/^DB-1210-0930-[0-9A-F]{4}$/);
    await expect(page.locator('[data-order-form]')).toBeHidden();
    await expect(page.locator('[data-cart-empty]')).toBeVisible();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      name: 'Иван Петров', phone: '0888 123 456', email: 'ivan@example.com', notes: 'Сграда 2, без лук', consent: true, aec: true,
    });
    expect(bodies[0].items).toHaveLength(3);
    expect(bodies[0].items[0]).toMatchObject({ id: 'duner-royal', size: 0, qty: 1, opts: { sauces: ['люто'], extras: [] } });
    expect(bodies[0].items[0].opts.ingredients).toHaveLength(9);
    expect(bodies[0].items[1]).toMatchObject({ id: 'box-large', qty: 1, opts: { ingredients: [], sauces: [], extras: [] } });
    expect(bodies[0].items[2]).toEqual({ id: 'drink-hell', size: 0, flavor: 'диня', qty: 1 });

    await page.locator('[data-new-order]').click();
    await expect(page.locator('[data-order-form]')).toBeVisible();
  });

  test('ако сървърът откаже (затворено), клиентът вижда съобщението', async ({ page }) => {
    await page.clock.setFixedTime(AT('09:59'));
    await routeWithClock(page, '2026-10-12T10:01:00+03:00');
    await page.goto('/');
    await addFood(page, 'duner-small');
    await fillForm(page);
    await page.locator('[data-submit]').click();
    await expect(page.locator('[data-form-msg]')).toHaveText(/само от 9:00 до 10:00/);
    await expect(page.locator('[data-done]')).toBeHidden();
  });

  test('плаващата количка се показва на телефон @mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-fab]')).toBeHidden();
    await page.locator('[data-hits] [data-add]').first().click();
    await page.locator('[data-b-add]').click();
    await expect(page.locator('[data-fab]')).toBeVisible();
    await expect(page.locator('[data-fab-count]')).toHaveText('1');
    await page.locator('[data-fab]').click();
    await expect(page.locator('#cart')).toBeInViewport();
  });
});
