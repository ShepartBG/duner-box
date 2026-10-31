const { test, expect } = require('@playwright/test');

const isMobile = (testInfo) => testInfo.project.name === 'mobile';
const EUR = /\d+,\d{2} €/;

// Понеделник, 12.10.2026, 10:30 софийско време — обектът е отворен, поръчките за АЕЦ са затворени
const MONDAY_1030 = new Date('2026-10-12T10:30:00+03:00');

async function openMobileNavIfNeeded(page, testInfo) {
  if (isMobile(testInfo)) {
    await page.locator('.burger').click();
    await expect(page.locator('#nav')).toHaveClass(/is-open/);
  }
}

test.describe('Duner Box', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(MONDAY_1030);
  });

  test('зарежда се без грешки, с правилно заглавие и ресурси', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const failed = [];
    page.on('response', (r) => {
      if (r.url().startsWith('http://localhost') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    await page.goto('/');
    await expect(page).toHaveTitle(/Duner Box/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'bg');
    await page.waitForLoadState('load');
    expect(failed, failed.join('\n')).toEqual([]);
    expect(errors.filter((e) => !/google|maps|fonts/i.test(e)), errors.join('\n')).toEqual([]);
    for (const p of ['/styles.css', '/script.js', '/menu-data.js', '/assets/favicon.svg', '/assets/storefront.jpg', '/assets/img/spit2.webp', '/assets/img/banner.webp']) {
      const r = await page.request.get(p);
      expect(r.status(), p).toBe(200);
    }
  });

  test('всички изображения на страницата се зареждат', async ({ page }) => {
    await page.goto('/');
    const srcs = await page.$$eval('img', (imgs) => [...new Set(imgs.map((i) => i.getAttribute('src')))]);
    expect(srcs.length).toBeGreaterThan(15);
    for (const s of srcs) {
      const r = await page.request.get('/' + s);
      expect(r.status(), s).toBe(200);
    }
  });

  test('сървърът не показва изходните снимки и кода на API-то', async ({ page }) => {
    for (const p of ['/photos/cena.JPG', '/api/order.js']) {
      const r = await page.request.get(p);
      expect(r.status(), p).toBe(403);
    }
  });

  test('всички секции са видими и с ключово съдържание', async ({ page }) => {
    await page.goto('/');
    const sections = [
      ['.topbar', null],
      ['header.header .logo', null],
      ['.hero', 'Горещо'],
      ['.hero .spit__img', null],
      ['.marquee', 'Грил сандвичи'],
      ['.banner img', null],
      ['#hits', 'Най-добрите'],
      ['.promo', 'Duner'],
      ['#menu', 'Избери си'],
      ['#order', 'АЕЦ Козлодуй'],
      ['.gallery', 'кухня'],
      ['#about', 'Кои сме ние'],
      ['.steps-sec', 'От шиша'],
      ['#visit', 'Търговска 77'],
      ['.cta', 'Коремът къркори?'],
      ['footer.footer', 'Всички права запазени'],
    ];
    for (const [sel, text] of sections) {
      const loc = page.locator(sel).first();
      await loc.scrollIntoViewIfNeeded();
      await expect(loc, sel).toBeVisible();
      if (text) await expect(loc, sel).toContainText(text);
    }
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('#hits-title')).toHaveText(/Най-добрите\s+на квартала/);
  });

  test('няма останали нарисувани храни — само снимки', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('use[href^="#ill-"]')).toHaveCount(0);
    await expect(page.locator('[data-hits] .hit img')).toHaveCount(3);
    await expect(page.locator('[data-menu] .row__img').first()).toBeVisible();
  });

  test('огнените ефекти са налице', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('.spit .flame').count()).toBeGreaterThanOrEqual(20);
    expect(await page.locator('.hero > .flames .flame').count()).toBeGreaterThan(10);
    expect(await page.locator('.promo__fire .flame').count()).toBeGreaterThan(10);
    expect(await page.locator('.cta .flame').count()).toBeGreaterThan(10);
    await expect(page.locator('.burn')).toHaveText('от шиша.');
    await expect(page.locator('[data-sticker] b')).toHaveText('8,00 €');
  });

  test('адресът и работното време са коректни', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#visit address')).toContainText('ул. Търговска 77');
    const rows = page.locator('[data-hours] tr');
    await expect(rows).toHaveCount(7);
    const expected = [
      ['Понеделник', '8:30 – 19:00'], ['Вторник', '8:30 – 19:00'], ['Сряда', '8:30 – 19:00'],
      ['Четвъртък', '8:30 – 19:00'], ['Петък', '8:30 – 19:00'], ['Събота', '10:00 – 18:00'],
      ['Неделя', 'Затворено'],
    ];
    for (let i = 0; i < expected.length; i++) {
      await expect(rows.nth(i).locator('th')).toHaveText(expected[i][0]);
      await expect(rows.nth(i).locator('td')).toHaveText(expected[i][1]);
    }
    await expect(page.locator('[data-hours] tr.is-today')).toHaveAttribute('data-day', '1');
  });

  test('статус: отворено в понеделник 10:30', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-status]')).toHaveClass(/is-open/);
    await expect(page.locator('[data-status-text]')).toHaveText('Отворено сега · до 19:00');
  });

  const closedCases = [
    ['неделя по обяд', '2026-10-11T12:00:00+03:00', 'Затворено · отваряме утре в 8:30', '0'],
    ['събота вечер', '2026-10-10T18:30:00+03:00', 'Затворено · отваряме в понеделник в 8:30', '6'],
    ['понеделник рано', '2026-10-12T07:00:00+03:00', 'Затворено · отваряме днес в 8:30', '1'],
  ];
  for (const [name, iso, text, day] of closedCases) {
    test(`статус: затворено — ${name}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(iso));
      await page.goto('/');
      await expect(page.locator('[data-status]')).toHaveClass(/is-closed/);
      await expect(page.locator('[data-status-text]')).toHaveText(text);
      await expect(page.locator('[data-hours] tr.is-today')).toHaveAttribute('data-day', day);
    });
  }

  test('всички вътрешни линкове сочат към съществуващи елементи', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page.$$eval('a[href^="#"]', (as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(10);
    for (const h of new Set(hrefs)) await expect(page.locator(h), `цел за ${h}`).toHaveCount(1);
  });

  test('външните линкове се отварят в нов таб', async ({ page }) => {
    await page.goto('/');
    const ext = page.locator('a[href^="http"]');
    const n = await ext.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i++) {
      const a = ext.nth(i);
      // Google Maps, Pexels (кредит за снимки) и подписът на автора на сайта
      expect(await a.getAttribute('href')).toMatch(/^https:\/\/(www\.(google\.com\/maps|pexels\.com)|hristiyan-ivanov\.pages\.dev\/)/);
      await expect(a).toHaveAttribute('target', '_blank');
      await expect(a).toHaveAttribute('rel', /noopener/);
    }
    await expect(page.locator('.visit__map iframe')).toHaveAttribute('src', /google\.com\/maps\?q=DUNER\+BOX.*output=embed/);
  });

  test('всички SVG препратки (<use>) съществуват', async ({ page }) => {
    await page.goto('/');
    const missing = await page.$$eval('use', (uses) =>
      uses.map((u) => u.getAttribute('href')).filter((h) => !document.querySelector(h)));
    expect(missing).toEqual([]);
  });

  test('навигацията скролва до всяка секция', async ({ page }, testInfo) => {
    await page.goto('/');
    for (const href of ['#hits', '#menu', '#about', '#hours', '#visit', '#order']) {
      await openMobileNavIfNeeded(page, testInfo);
      await page.locator(`#nav a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.locator(href)).toBeInViewport();
      if (isMobile(testInfo)) await expect(page.locator('#nav')).not.toHaveClass(/is-open/);
    }
  });

  test('бутоните в hero и CTA водят до правилните секции', async ({ page }) => {
    await page.goto('/');
    await page.locator('.hero a', { hasText: 'Поръчай за АЕЦ' }).click();
    await expect(page.locator('#order')).toBeInViewport();
    await page.goto('/');
    await page.locator('.hero a', { hasText: 'Виж менюто' }).click();
    await expect(page.locator('#menu')).toBeInViewport();
    await page.locator('.cta a', { hasText: 'Идвам на място' }).click();
    await expect(page.locator('#visit')).toBeInViewport();
    await page.locator('.cta a', { hasText: 'Поръчай' }).click();
    await expect(page.locator('#order')).toBeInViewport();
    await page.locator('.footer .totop').click();
    await expect(page.locator('.header')).toBeInViewport();
  });

  test('най-добрите: 3 карти с номера, цени и бутон „Добави“', async ({ page }) => {
    await page.goto('/');
    const hits = page.locator('[data-hits] .hit');
    await expect(hits).toHaveCount(3);
    await expect(hits.locator('.hit__num')).toHaveText(['01', '02', '03']);
    await expect(hits.locator('h3')).toHaveText(['Дюнер кралски', 'Duner Box голям', 'Роял']);
    await expect(hits.locator('.price')).toHaveText(['8,00 €', '6,00 €', 'от 4,50 €']);
    await hits.nth(1).locator('[data-add]').click();
    await expect(page.locator('[data-builder]')).toBeVisible();
    await page.locator('[data-b-add]').click();
    await expect(page.locator('[data-cart-list] .cart__line')).toHaveCount(1);
    await expect(page.locator('[data-cart-total]')).toHaveText('6,00 €');
  });

  test('промо: цени на Duner Box и бутони', async ({ page }) => {
    await page.goto('/');
    const pp = page.locator('[data-promo-prices] .pp');
    await expect(pp).toHaveCount(2);
    await expect(pp.nth(0)).toContainText('5,00 €');
    await expect(pp.nth(1)).toContainText('6,00 €');
    await page.locator('.promo a', { hasText: 'Към менюто' }).click();
    await expect(page.locator('#tab-box')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-board]:visible')).toHaveCount(1);
    await page.locator('.promo a', { hasText: 'Поръчай кутия' }).click();
    await expect(page.locator('#shop-tab-box')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-product]:visible')).toHaveCount(2);
  });

  test('меню: всички табове филтрират правилно', async ({ page }) => {
    await page.goto('/');
    const expected = { all: 47, duner: 4, box: 2, sandwich: 6, pocket: 2, burger: 2, salad: 3, sides: 3, extras: 11, drinks: 14 };
    await expect(page.locator('[data-tabs] .tab')).toHaveCount(10);
    for (const [cat, count] of Object.entries(expected)) {
      await page.locator(`#tab-${cat}`).click();
      await expect(page.locator(`#tab-${cat}`)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[data-menu] .row:visible')).toHaveCount(count);
      await expect(page.locator('[data-board]:visible')).toHaveCount(cat === 'all' ? 9 : 1);
    }
  });

  test('меню: цените съвпадат с ценоразписа в обекта', async ({ page }) => {
    await page.goto('/');
    const check = async (id, texts) => {
      const r = page.locator(`[data-item="${id}"] .row__prices`);
      for (const t of texts) await expect(r).toContainText(t);
    };
    await check('duner-small', ['4,00 €']);
    await check('duner-medium', ['4,50 €']);
    await check('duner-large', ['5,00 €']);
    await check('duner-royal', ['8,00 €']);
    await check('box-small', ['5,00 €']);
    await check('box-large', ['6,00 €']);
    await check('sand-donvito', ['малък', '5,00 €', 'голям', '6,00 €']);
    await check('sand-tarikatski', ['5,00 €', '6,00 €']);
    await check('sand-royal', ['4,50 €', '5,00 €']);
    await check('sand-ham', ['4,50 €', '5,00 €']);
    await check('sand-majo', ['4,50 €', '5,00 €']);
    await check('sand-pacific', ['5,00 €', '5,50 €']);
    await check('pocket-combo', ['5,00 €']);
    await check('pocket-meat', ['6,00 €']);
    await check('burger-chicken', ['6,00 €']);
    await check('burger-beef', ['7,00 €']);
    await check('salad-doner-small', ['6,00 €']);
    await check('salad-doner-large', ['7,00 €']);
    await check('salad-tuna', ['6,00 €']);
    await check('side-fries', ['2,50 €']);
    await check('side-rice', ['2,00 €']);
    await check('side-meat', ['3,00 €']);
    await expect(page.locator('[data-board="sandwich"] .board__sub')).toHaveText('малък 330 гр. · голям 480 гр.');
  });

  test('меню: всички добавки са изписани с цени', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-board="extras"] h4')).toHaveText([
      'Телешко кюфте', 'Бекон', 'Луканка', 'Шунка', 'Кашкавал', 'Чедър', 'Топено сирене', 'Яйце', 'Питка', 'Ориз', 'Картофи']);
    await expect(page.locator('[data-board="extras"] .soon')).toHaveCount(0);
    await expect(page.locator('[data-item="extra-kofte"]')).toContainText('2,00 €');
    for (const id of ['extra-bacon', 'extra-lukanka', 'extra-ham', 'extra-cheese', 'extra-cheddar', 'extra-melted', 'extra-egg', 'extra-pita', 'extra-rice', 'extra-fries']) {
      await expect(page.locator(`[data-item="${id}"]`)).toContainText('1,00 €');
    }
    await expect(page.locator('[data-board="extras"]')).not.toContainText('гр.');
    await expect(page.locator('[data-board="sides"] h4')).toHaveText(['Картофки', 'Ориз', 'Допълнително месо']);
  });

  test('меню: напитките са с цени и всички вкусове', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-board="drinks"] .soon')).toHaveCount(0);
    const check = async (id, texts) => {
      for (const t of texts) await expect(page.locator(`[data-item="${id}"]`)).toContainText(t);
    };
    await check('drink-cola', ['Coca-Cola', '1,50 €']);
    await check('drink-zero', ['Coca-Cola Zero', '1,50 €']);
    await check('drink-queens', ['кайсия', 'драконов плод', 'къпина', '1,50 €']);
    await check('drink-hell', ['класик', 'розова гуава', 'зеро']);
    await check('drink-tea', ['лимон', 'горски плодове']);
    await check('drink-icecoffee', ['Pink Latte', 'двойно еспресо']);
    await check('drink-velingrad', ['0,5 л', '0,50 €', '1,5 л', '1,00 €']);
    await check('drink-water', ['Горна баня', '0,50 €', '1,00 €']);
    await check('drink-velingrad-flavor', ['праскова', 'ягода', 'лимон', '1,50 €']);
    await check('drink-ayran', ['Айрян', '1,50 €']);
    await check('drink-isosport', ['Изо спорт', '1,50 €']);
    const flavors = await page.$$eval('[data-board="drinks"] .row__flavors', (ps) => ps.reduce((n, p) => n + p.textContent.split(' · ').length, 0));
    const plain = await page.$$eval('[data-board="drinks"] .row:not(:has(.row__flavors)) .pr', (prs) => prs.length);
    expect(flavors + plain).toBe(51); // всички 51 напитки от ценоразписа
  });

  test('меню: табовете работят и със стрелки', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tab-all').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-duner')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#tab-drinks')).toHaveAttribute('aria-selected', 'true');
  });

  test('бутоните за упътване работят', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-directions]').scrollIntoViewIfNeeded();
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-directions]').click()]);
    expect(popup.url()).toMatch(/google\.com/);
    await popup.close();
  });

  test('няма хоризонтален скрол', async ({ page }) => {
    await page.goto('/');
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw).toBeLessThanOrEqual(cw);
  });

  test('хедърът остава закачен горе при скрол', async ({ page }) => {
    await page.goto('/');
    await page.locator('#visit').scrollIntoViewIfNeeded();
    expect(await page.locator('header.header').evaluate((h) => h.getBoundingClientRect().top)).toBe(0);
  });
});

test.describe('мобилна навигация', () => {
  test('бургер менюто се отваря и затваря @mobile', async ({ page }) => {
    await page.goto('/');
    const burger = page.locator('.burger');
    await burger.click();
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#nav a', { hasText: 'Меню' })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
    await burger.click();
    await page.mouse.click(10, 400);
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
  });

  test('на компютър бургерът е скрит, а линковете видими @desktop', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.burger')).toBeHidden();
    for (const t of ['Най-добрите', 'Меню', 'За нас', 'Работно време', 'Контакти', 'Поръчай за АЕЦ']) {
      await expect(page.locator('#nav a', { hasText: t })).toBeVisible();
    }
  });
});

test('всяка позиция в менюто има собствена, уникална снимка', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('[data-menu] .row');
  const n = await rows.count();
  expect(n).toBe(47);
  const srcs = [];
  for (let i = 0; i < n; i++) {
    const id = await rows.nth(i).getAttribute('data-item');
    const src = await rows.nth(i).locator('.row__img').getAttribute('src');
    expect(src, id).toBe(`assets/img/items/${id}.webp`);
    expect((await page.request.get('/' + src)).status(), src).toBe(200);
    srcs.push(src);
  }
  expect(new Set(srcs).size).toBe(n);
  const shop = await page.$$eval('[data-product] .product__img', (imgs) => imgs.map((i) => i.getAttribute('src')));
  expect(new Set(shop).size).toBe(36); // добавките не са в магазина, а в прозореца
});

test.describe('лого и връщане най-горе', () => {
  test('клик на логото: храни излитат, страницата отива най-горе, адресът е без #', async ({ page }) => {
    await page.goto('/');
    await page.locator('#nav a[href="#visit"]').evaluate((a) => a.click());
    await expect(page).toHaveURL(/#visit$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await page.locator('header .logo').click();
    await expect.poll(() => page.locator('.food').count()).toBeGreaterThan(10);
    await expect(page.locator('header .logo')).toHaveClass(/is-pop/);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBe(0);
    expect(new URL(page.url()).hash).toBe('');
    await expect.poll(() => page.locator('.food').count(), { timeout: 4000 }).toBe(0); // почистват се
  });

  test('логото във футъра също връща най-горе', async ({ page }) => {
    await page.goto('/');
    await page.locator('footer .logo').scrollIntoViewIfNeeded();
    await page.locator('footer .logo').click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBe(0);
  });

  test('при презареждане страницата винаги започва отгоре', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, 3000));
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('адрес с #котва отваря страницата отгоре и чисти адреса', async ({ page }) => {
    await page.goto('/#menu');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    expect(new URL(page.url()).hash).toBe('');
  });
});

test('данните на фирмата са във футъра и в съгласието', async ({ page }) => {
  await page.goto('/');
  const f = page.locator('.footer__company');
  await expect(f).toContainText('Станислав Стоянов-94 ЕООД');
  await expect(f).toContainText('ЕИК 206587193');
  await expect(f).toContainText('ул. Търговска 77, 3320 Козлодуй');
  await expect(page.locator('.check:not(.check--aec)')).toContainText('Станислав Стоянов-94');
  await expect(page.locator('[data-phone]')).toHaveCount(2);
  for (const p of await page.locator('[data-phone]').all()) await expect(p).toBeHidden(); // няма телефон засега
  await expect(page.locator('#contacts a[href="mailto:dunerbox77@abv.bg"]')).toHaveText('dunerbox77@abv.bg');
  await expect(page.locator('.footer__contact a[href="mailto:dunerbox77@abv.bg"]')).toBeVisible();
});

test('ясно е, че доставката е само до АЕЦ Козлодуй', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero__aec')).toContainText('само с доставка до АЕЦ Козлодуй');
  await expect(page.locator('.aec-only')).toContainText('Доставяме САМО в АЕЦ Козлодуй');
  await expect(page.locator('.aec-only')).toContainText('из град Козлодуй');
  await expect(page.locator('.check--aec input')).toHaveAttribute('required', '');
});

test('политика за поверителност', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.footer__company a[href="privacy.html"]')).toBeVisible();
  await expect(page.locator('.check:not(.check--aec) a[href="privacy.html"]')).toHaveAttribute('target', '_blank');
  await page.goto('/privacy.html');
  await expect(page.locator('h1')).toHaveText('Политика за поверителност');
  for (const t of ['Станислав Стоянов-94', '206587193', 'dunerbox77@abv.bg', '90 дни', 'Комисията за защита на личните данни', 'Cloudflare', 'Resend']) {
    await expect(page.locator('body')).toContainText(t);
  }
});
