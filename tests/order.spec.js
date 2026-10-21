const { test, expect } = require('@playwright/test');

// Понеделник, 12.10.2026
const AT = (hm) => new Date(`2026-10-12T${hm}:00+03:00`);

async function fillForm(page, { name = 'Иван Петров', phone = '0888 123 456', email = 'ivan@example.com', notes = 'Сграда 2, без лук', consent = true } = {}) {
  await page.fill('#f-name', name);
  await page.fill('#f-phone', phone);
  await page.fill('#f-email', email);
  await page.fill('#f-notes', notes);
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
    await page.locator('#shop-tab-duner').click();
    await page.locator('[data-product="duner-royal"] [data-add]').click();
    await page.locator('[data-product="duner-royal"] [data-add]').click();
    await page.locator('#shop-tab-sandwich').click();
    const sand = page.locator('[data-product="sand-tarikatski"]');
    await sand.locator('[data-size-pick="1"]').click();
    await expect(sand.locator('[data-product-price]')).toHaveText('6,00 €');
    await sand.locator('[data-add]').click();
    await page.locator('#shop-tab-drinks').click();
    await page.locator('[data-product="drink-cola"] [data-add]').click();

    const lines = page.locator('[data-cart-list] .cart__line');
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toContainText('Дюнер кралски');
    await expect(lines.nth(0).locator('[data-qty-val]')).toHaveText('2');
    await expect(lines.nth(1)).toContainText('Тарикатски (голям)');
    await expect(page.locator('[data-cart-total]')).toHaveText('22,00 €');
    await expect(page.locator('[data-cart-unpriced]')).toBeVisible();

    await lines.nth(0).locator('[data-qty="-1"]').click();
    await expect(page.locator('[data-cart-total]')).toHaveText('14,00 €');
    await lines.nth(2).locator('[data-qty="-1"]').click();
    await expect(lines).toHaveCount(2);
    await expect(page.locator('[data-cart-unpriced]')).toBeHidden();

    // количката се помни след презареждане
    await page.reload();
    await expect(page.locator('[data-cart-list] .cart__line')).toHaveCount(2);
    await page.locator('[data-cart-clear]').click();
    await expect(page.locator('[data-cart-empty]')).toBeVisible();
  });

  test('извън 9:00–10:00 бутонът за изпращане е заключен', async ({ page }) => {
    await page.clock.setFixedTime(AT('10:30'));
    await page.goto('/');
    await page.locator('[data-product="duner-small"] [data-add]').click();
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
    await page.locator('[data-product="duner-small"] [data-add]').click();
    await fillForm(page, { name: '', phone: '123', email: 'не-е-имейл', consent: false });
    await page.locator('[data-submit]').click();
    await expect(page.locator('[data-err="name"]')).toHaveText('Въведи имената си.');
    await expect(page.locator('[data-err="phone"]')).toHaveText('Въведи валиден телефон.');
    await expect(page.locator('[data-err="email"]')).toHaveText('Въведи валиден имейл.');
    await expect(page.locator('[data-err="consent"]')).not.toBeEmpty();
    await expect(page.locator('#f-name')).toBeFocused();
    await expect(page.locator('[data-done]')).toBeHidden();
  });

  test('успешна поръчка в 9:30 стига до сървъра и показва потвърждение', async ({ page }) => {
    await page.clock.setFixedTime(AT('09:30'));
    const bodies = await routeWithClock(page, '2026-10-12T09:30:00+03:00');
    await page.goto('/');
    await page.locator('[data-product="duner-royal"] [data-add]').click();
    await page.locator('#shop-tab-box').click();
    await page.locator('[data-product="box-large"] [data-add]').click();
    await fillForm(page);
    await expect(page.locator('[data-submit]')).toBeEnabled();
    await expect(page.locator('[data-submit-total]')).toHaveText('· 14,00 €');
    await page.locator('[data-submit]').click();

    await expect(page.locator('[data-done]')).toBeVisible();
    await expect(page.locator('[data-done-id]')).toHaveText(/^DB-1210-0930-\d{3}$/);
    await expect(page.locator('[data-order-form]')).toBeHidden();
    await expect(page.locator('[data-cart-empty]')).toBeVisible();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      name: 'Иван Петров', phone: '0888 123 456', email: 'ivan@example.com', notes: 'Сграда 2, без лук', consent: true,
      items: [{ id: 'duner-royal', size: 0, qty: 1 }, { id: 'box-large', size: 0, qty: 1 }],
    });

    await page.locator('[data-new-order]').click();
    await expect(page.locator('[data-order-form]')).toBeVisible();
  });

  test('ако сървърът откаже (затворено), клиентът вижда съобщението', async ({ page }) => {
    await page.clock.setFixedTime(AT('09:59'));
    await routeWithClock(page, '2026-10-12T10:01:00+03:00');
    await page.goto('/');
    await page.locator('[data-product="duner-small"] [data-add]').click();
    await fillForm(page);
    await page.locator('[data-submit]').click();
    await expect(page.locator('[data-form-msg]')).toHaveText(/само от 9:00 до 10:00/);
    await expect(page.locator('[data-done]')).toBeHidden();
  });

  test('плаващата количка се показва на телефон', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'само за телефон');
    await page.goto('/');
    await expect(page.locator('[data-fab]')).toBeHidden();
    await page.locator('[data-hits] [data-add]').first().click();
    await expect(page.locator('[data-fab]')).toBeVisible();
    await expect(page.locator('[data-fab-count]')).toHaveText('1');
    await page.locator('[data-fab]').click();
    await expect(page.locator('#cart')).toBeInViewport();
  });
});
