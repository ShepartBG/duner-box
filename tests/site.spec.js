const { test, expect } = require('@playwright/test');

const isMobile = (testInfo) => testInfo.project.name === 'mobile';
const PRICE = /\d+,\d{2} €\s*\d+,\d{2} лв/;

// Понеделник, 12.10.2026, 10:00 софийско време — отворено
const MONDAY_10 = new Date('2026-10-12T10:00:00+03:00');

async function openMobileNavIfNeeded(page, testInfo) {
  if (isMobile(testInfo)) {
    await page.locator('.burger').click();
    await expect(page.locator('#nav')).toHaveClass(/is-open/);
  }
}

test.describe('Duner Box', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(MONDAY_10);
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

    for (const p of ['/styles.css', '/script.js', '/assets/favicon.svg', '/assets/storefront.jpg']) {
      const r = await page.request.get(p);
      expect(r.status(), p).toBe(200);
    }
  });

  test('всички секции са видими и с ключово съдържание', async ({ page }) => {
    await page.goto('/');
    const sections = [
      ['.topbar', null],
      ['header.header .logo', null],
      ['.hero', 'Горещо'],
      ['.marquee', 'Грил сандвичи'],
      ['#hits', 'Топ 3'],
      ['.promo', 'Duner'],
      ['#menu', 'Избери си'],
      ['#about', 'Кои сме ние'],
      ['#about img', null],
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
  });

  test('логото, снимката и огнените ефекти са налице', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.header .logo__word')).toContainText('DUNER');
    await expect(page.locator('.header .logo__o')).toBeVisible();
    await expect(page.locator('[data-sticker] b')).toHaveText('5,11 €');
    expect(await page.locator('.hero .flame').count()).toBeGreaterThan(10);
    expect(await page.locator('.cta .flame').count()).toBeGreaterThan(10);
    const img = page.locator('#about img');
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute('alt', /Duner Box/);
    await expect.poll(() => img.evaluate((i) => (i.complete ? i.naturalWidth : 0))).toBeGreaterThan(0);
  });

  test('адресът и работното време са коректни', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#visit address')).toContainText('ул. Търговска 77');
    await expect(page.locator('#visit address')).toContainText('3320 Козлодуй');
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

  test('статус: отворено в понеделник 10:00', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-status]')).toHaveClass(/is-open/);
    await expect(page.locator('[data-status-text]')).toHaveText('Отворено сега · до 19:00');
  });

  const closedCases = [
    ['неделя по обяд', '2026-10-11T12:00:00+03:00', 'Затворено · отваряме утре в 8:30', '0'],
    ['събота вечер', '2026-10-10T18:30:00+03:00', 'Затворено · отваряме в понеделник в 8:30', '6'],
    ['понеделник рано', '2026-10-12T07:00:00+03:00', 'Затворено · отваряме днес в 8:30', '1'],
    ['петък вечер', '2026-10-16T19:00:00+03:00', 'Затворено · отваряме утре в 10:00', '5'],
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
    for (const h of new Set(hrefs)) {
      await expect(page.locator(h), `цел за ${h}`).toHaveCount(1);
    }
  });

  test('външните линкове водят към Google Maps и се отварят в нов таб', async ({ page }) => {
    await page.goto('/');
    const ext = page.locator('a[href^="http"]');
    const n = await ext.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i++) {
      const a = ext.nth(i);
      const href = await a.getAttribute('href');
      expect(href).toMatch(/^https:\/\/www\.google\.com\/maps\//);
      expect(decodeURIComponent(href)).toMatch(/DUNER\+BOX,\+Kozloduy/);
      await expect(a).toHaveAttribute('target', '_blank');
      await expect(a).toHaveAttribute('rel', /noopener/);
    }
    const map = page.locator('.visit__map iframe');
    await expect(map).toHaveAttribute('src', /google\.com\/maps\?q=DUNER\+BOX.*output=embed/);
    await expect(map).toHaveAttribute('title', /Карта/);
  });

  test('всички SVG препратки (<use>) съществуват', async ({ page }) => {
    await page.goto('/');
    const missing = await page.$$eval('use', (uses) =>
      uses.map((u) => u.getAttribute('href')).filter((h) => !document.querySelector(h)));
    expect(missing).toEqual([]);
  });

  test('навигацията скролва до всяка секция', async ({ page }, testInfo) => {
    await page.goto('/');
    for (const href of ['#hits', '#menu', '#about', '#hours', '#visit']) {
      await openMobileNavIfNeeded(page, testInfo);
      await page.locator(`#nav a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.locator(href)).toBeInViewport();
      if (isMobile(testInfo)) await expect(page.locator('#nav')).not.toHaveClass(/is-open/);
    }
  });

  test('бутоните в hero и CTA водят до правилните секции', async ({ page }) => {
    await page.goto('/');
    await page.locator('.hero a', { hasText: 'Виж менюто' }).click();
    await expect(page.locator('#menu')).toBeInViewport();
    await page.goto('/');
    await page.locator('.hero a', { hasText: 'Къде сме' }).click();
    await expect(page.locator('#visit')).toBeInViewport();
    await page.locator('.cta a', { hasText: 'Идвам' }).click();
    await expect(page.locator('#visit')).toBeInViewport();
    await page.locator('.footer .totop').click();
    await expect(page.locator('.header')).toBeInViewport();
    await page.locator('.header .logo').click();
    await expect(page).toHaveURL(/#top$/);
  });

  test('хитове: 3 карти с номера, цени и линк към категорията', async ({ page }) => {
    await page.goto('/');
    const hits = page.locator('[data-hits] .hit');
    await expect(hits).toHaveCount(3);
    await expect(hits.locator('.hit__num')).toHaveText(['01', '02', '03']);
    await expect(hits.locator('h3')).toHaveText(['Дюнер кралски', 'Duner Box голям', 'Тарикатски']);
    for (let i = 0; i < 3; i++) await expect(hits.nth(i).locator('.price')).toHaveText(PRICE);
    await hits.nth(1).locator('a').click();
    await expect(page.locator('#tab-box')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#menu')).toBeInViewport();
    await expect(page.locator('[data-board]:visible')).toHaveCount(1);
    await expect(page.locator('[data-board="box"] .row')).toHaveCount(2);
  });

  test('промо: цени на Duner Box и бутон към кутиите', async ({ page }) => {
    await page.goto('/');
    const pp = page.locator('[data-promo-prices] .pp');
    await expect(pp).toHaveCount(2);
    await expect(pp.nth(0)).toContainText('малък');
    await expect(pp.nth(0)).toContainText('3,07 €');
    await expect(pp.nth(0)).toContainText('6,00 лв');
    await expect(pp.nth(1)).toContainText('голям');
    await expect(pp.nth(1)).toContainText('3,58 €');
    await expect(pp.nth(1)).toContainText('7,00 лв');
    await page.locator('.promo a', { hasText: 'Към кутиите' }).click();
    await expect(page.locator('#tab-box')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-board]:visible')).toHaveCount(1);
    await expect(page.locator('[data-board="box"] .row h4')).toContainText(['Duner Box малък', 'Duner Box голям']);
  });

  test('меню: всички табове филтрират правилно', async ({ page }) => {
    await page.goto('/');
    const expected = { all: 26, duner: 5, box: 2, sandwich: 6, pocket: 9, salad: 3, sides: 1 };
    await expect(page.locator('[data-tabs] .tab')).toHaveCount(7);
    await expect(page.locator('#tab-all')).toHaveAttribute('aria-selected', 'true');
    for (const [cat, count] of Object.entries(expected)) {
      await page.locator(`#tab-${cat}`).click();
      await expect(page.locator(`#tab-${cat}`)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[data-tabs] .tab[aria-selected="true"]')).toHaveCount(1);
      await expect(page.locator('[data-menu] .row:visible')).toHaveCount(count);
      await expect(page.locator('[data-board]:visible')).toHaveCount(cat === 'all' ? 6 : 1);
      if (cat !== 'all') {
        const cats = await page.locator('[data-menu] .row:visible').evaluateAll((els) => els.map((e) => e.dataset.cat));
        expect(new Set(cats)).toEqual(new Set([cat]));
      }
    }
  });

  test('меню: всяка позиция има име и цена в евро и лева', async ({ page }) => {
    await page.goto('/');
    const items = page.locator('[data-menu] .row');
    const n = await items.count();
    expect(n).toBe(26);
    for (let i = 0; i < n; i++) {
      const it = items.nth(i);
      await expect(it.locator('h4')).not.toBeEmpty();
      const prices = it.locator('.pr');
      const pc = await prices.count();
      expect(pc).toBeGreaterThanOrEqual(1);
      for (let j = 0; j < pc; j++) await expect(prices.nth(j)).toHaveText(PRICE);
    }
  });

  test('меню: цените съвпадат с менюто в обекта', async ({ page }) => {
    await page.goto('/');
    const check = async (id, texts) => {
      const r = page.locator(`[data-item="${id}"] .row__prices`);
      for (const t of texts) await expect(r).toContainText(t);
    };
    await check('duner-small', ['5,00 лв', '2,56 €']);
    await check('duner-medium', ['6,00 лв']);
    await check('duner-large', ['7,00 лв']);
    await check('duner-royal', ['10,00 лв', '5,11 €']);
    await check('extra-meat', ['4,00 лв']);
    await check('sand-tarikatski', ['малък', '6,50 лв', 'голям', '8,50 лв']);
    await check('sand-ham', ['5,50 лв', '6,50 лв']);
    await check('pocket-doner', ['7,00 лв']);
    await check('pocket-veg', ['4,00 лв']);
    await check('salad-tuna', ['6,50 лв']);
    await check('fries', ['2,50 лв', '1,28 €']);
    await expect(page.locator('[data-board="sandwich"] .board__sub')).toHaveText('малък 330 гр. · голям 480 гр.');
    await expect(page.locator('[data-board="pocket"] .board__sub')).toHaveText('600 гр. · меча лапа');
  });

  test('меню: табовете работят и със стрелки от клавиатурата', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tab-all').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-duner')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tab-duner')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#tab-sides')).toHaveAttribute('aria-selected', 'true');
  });

  test('бутоните за упътване са видими и кликаеми', async ({ page }) => {
    await page.goto('/');
    const btns = page.locator('.visit__btns a');
    await expect(btns).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await btns.nth(i).scrollIntoViewIfNeeded();
      await expect(btns.nth(i)).toBeVisible();
    }
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('[data-directions]').click(),
    ]);
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
    const top = await page.locator('header.header').evaluate((h) => h.getBoundingClientRect().top);
    expect(top).toBe(0);
  });
});

test.describe('мобилна навигация', () => {
  test('бургер менюто се отваря и затваря', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'само за телефон');
    await page.goto('/');
    const burger = page.locator('.burger');
    const nav = page.locator('#nav');
    await expect(burger).toBeVisible();
    await expect(nav).not.toBeInViewport();
    await burger.click();
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.locator('a', { hasText: 'Меню' })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
    await burger.click();
    await page.mouse.click(10, 400); // клик върху затъмнения фон
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
  });

  test('на компютър бургерът е скрит, а линковете видими', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'само за компютър');
    await page.goto('/');
    await expect(page.locator('.burger')).toBeHidden();
    for (const t of ['Хитове', 'Меню', 'За нас', 'Работно време', 'Контакти', 'Как да стигна']) {
      await expect(page.locator('#nav a', { hasText: t })).toBeVisible();
    }
  });
});
