// Одобрение на поръчка от собственика: поръчка → имейл с бутони → страница → решение → имейл до клиента
const { test, expect } = require('@playwright/test');
const { handleOrder, sign } = require('../api/order.js');
const { handleDecision } = require('../api/decision.js');
const { memoryStore } = require('../api/store.js');


const ENV = { RESEND_API_KEY: 're_test', RESEND_FROM: 'Duner Box <poruchki@dunerbox.bg>', OWNER_EMAIL: 'jeki.1997@abv.bg', ORDER_SECRET: 'test-secret' };
const OPEN = new Date('2026-10-12T09:15:00+03:00');
const body = {
  name: 'Мария Иванова', phone: '0888 123 456', email: 'maria@example.com', notes: 'Корпус 3', consent: true, aec: true,
  items: [{ id: 'duner-large', size: 0, qty: 1, opts: { ingredients: ['зеле'], sauces: ['люто'], extras: ['extra-kofte'] } }],
};

function setup() {
  const sent = [];
  const fetchImpl = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({}) }; };
  return { sent, fetchImpl, store: memoryStore() };
}
const linkParams = (url) => Object.fromEntries(new URL(url).searchParams);
let ipN = 0;
const order = (s) => handleOrder(body, { now: OPEN, env: ENV, fetchImpl: s.fetchImpl, store: s.store, baseUrl: 'https://dunerbox.bg', ip: `10.0.0.${++ipN}` });

test('поръчката се записва като чакаща, собственикът получава линкове', async () => {
  const s = setup();
  const r = await order(s);
  expect(r.status).toBe(200);
  expect(r.json.pending).toBe(true);
  const saved = await s.store.get(r.json.orderId);
  expect(saved.status).toBe('pending');
  expect(saved.total).toBe(7);
  const owner = s.sent[0];
  const accept = owner.html.match(/href="([^"]+a=accept)"/)[1].replace(/&amp;/g, '&');
  expect(accept).toBe(`https://dunerbox.bg/api/decision?id=${r.json.orderId}&sig=${sign(r.json.orderId, 'test-secret')}&a=accept`);
  expect(owner.text).toContain('Приемам: https://dunerbox.bg/api/decision?');
});

test('GET само показва страница — нищо не се променя (защита от автоматично отваряне на линкове)', async () => {
  const s = setup();
  const r = await order(s);
  const p = linkParams(s.sent[0].html.match(/href="([^"]+a=accept)"/)[1].replace(/&amp;/g, '&'));
  const page = await handleDecision({ method: 'GET', params: p }, { env: ENV, store: s.store, fetchImpl: s.fetchImpl, now: OPEN });
  expect(page.status).toBe(200);
  expect(page.html).toContain('Потвърди — приемам');
  expect(page.html).toContain('+ телешко кюфте');
  expect((await s.store.get(r.json.orderId)).status).toBe('pending');
  expect(s.sent).toHaveLength(2); // само двата имейла от поръчката
});

test('приемане: статусът става „приета“ и клиентът получава имейл', async () => {
  const s = setup();
  const r = await order(s);
  const id = r.json.orderId;
  const res = await handleDecision({ method: 'POST', params: { id, sig: sign(id, 'test-secret'), a: 'accept' } }, { env: ENV, store: s.store, fetchImpl: s.fetchImpl, now: OPEN });
  expect(res.html).toContain('е приета');
  expect((await s.store.get(id)).status).toBe('accepted');
  const mail = s.sent[2];
  expect(mail.to).toEqual(['maria@example.com']);
  expect(mail.subject).toContain('е приета');
  expect(mail.html).toContain('30 минути');
  expect(mail.html).toContain('7,00 €');

  // повторно натискане — нищо ново, без втори имейл
  const again = await handleDecision({ method: 'POST', params: { id, sig: sign(id, 'test-secret'), a: 'decline' } }, { env: ENV, store: s.store, fetchImpl: s.fetchImpl, now: OPEN });
  expect(again.html).toContain('Вече е приета');
  expect((await s.store.get(id)).status).toBe('accepted');
  expect(s.sent).toHaveLength(3);
});

test('отказ с причина: клиентът получава извинение с причината', async () => {
  const s = setup();
  const r = await order(s);
  const id = r.json.orderId;
  const get = await handleDecision({ method: 'GET', params: { id, sig: sign(id, 'test-secret'), a: 'decline' } }, { env: ENV, store: s.store, now: OPEN });
  expect(get.html).toContain('name="reason"');
  await handleDecision({ method: 'POST', params: { id, sig: sign(id, 'test-secret'), a: 'decline', reason: 'Свърши кюфтето <b>' } }, { env: ENV, store: s.store, fetchImpl: s.fetchImpl, now: OPEN });
  const saved = await s.store.get(id);
  expect(saved.status).toBe('declined');
  expect(saved.reason).toBe('Свърши кюфтето <b>');
  const mail = s.sent[2];
  expect(mail.subject).toContain('не може да бъде изпълнена');
  expect(mail.html).toContain('Свърши кюфтето &lt;b&gt;');
});

test('грешен подпис, непозната поръчка и изтекла поръчка', async () => {
  const s = setup();
  const r = await order(s);
  const id = r.json.orderId;
  const bad = await handleDecision({ method: 'POST', params: { id, sig: 'x'.repeat(32), a: 'accept' } }, { env: ENV, store: s.store, fetchImpl: s.fetchImpl, now: OPEN });
  expect(bad.status).toBe(403);
  const other = await handleDecision({ method: 'POST', params: { id, sig: sign(id, 'друг-ключ'), a: 'accept' } }, { env: ENV, store: s.store, fetchImpl: s.fetchImpl, now: OPEN });
  expect(other.status).toBe(403);
  const missing = await handleDecision({ method: 'GET', params: { id: 'DB-0000', sig: sign('DB-0000', 'test-secret'), a: 'accept' } }, { env: ENV, store: s.store, now: OPEN });
  expect(missing.status).toBe(404);
  const late = await handleDecision({ method: 'POST', params: { id, sig: sign(id, 'test-secret'), a: 'accept' } }, { env: ENV, store: s.store, fetchImpl: s.fetchImpl, now: new Date(OPEN.getTime() + 4 * 3600e3) });
  expect(late.status).toBe(410);
  expect((await s.store.get(id)).status).toBe('pending');
  expect(s.sent).toHaveLength(2);
});

test('без ORDER_SECRET истински имейли не се пращат', async () => {
  const s = setup();
  const r = await handleOrder(body, { now: OPEN, env: { ...ENV, ORDER_SECRET: '' }, fetchImpl: s.fetchImpl, store: s.store, ip: '10.9.9.9' });
  expect(r.status).toBe(500);
  expect(s.sent).toHaveLength(0);
});

test('целият цикъл през локалния сървър (браузър → решение)', async ({ page, request }) => {
  await page.clock.setFixedTime(new Date('2026-10-12T09:30:00+03:00'));
  await page.route('**/api/order', async (route) => {
    const res = await route.fetch({ headers: { ...route.request().headers(), 'x-test-now': '2026-10-12T09:30:00+03:00' } });
    await route.fulfill({ response: res });
  });
  await page.goto('/');
  await page.locator('#shop-tab-drinks').click();
  await page.locator('[data-product="drink-ayran"] [data-add]').click();
  await page.fill('#f-name', 'Тест Тестов');
  await page.fill('#f-phone', '0888 123 456');
  await page.fill('#f-email', 'test@example.com');
  await page.locator('[name="aec"]').check();
  await page.locator('[name="consent"]').check();
  await page.locator('[data-submit]').click();
  await expect(page.locator('[data-done]')).toBeVisible();
  await expect(page.locator('[data-done]')).toContainText('Очаквай потвърждение');

  const id = (await page.locator('[data-done-id]').innerText()).trim();
  expect(id).toMatch(/^DB-1210-0930-[0-9A-F]{4}$/);
  const sig = sign(id, 'test-server-secret'); // ключът на тестовия сървър (playwright.config.js)
  await page.setExtraHTTPHeaders({ 'x-test-now': '2026-10-12T09:35:00+03:00' });
  await page.goto(`/api/decision?id=${id}&sig=${sig}&a=accept`);
  await expect(page.locator('h1')).toContainText(`Приемаш ли поръчка ${id}`);
  await page.locator('button.ok').click();
  await expect(page.locator('h1')).toContainText(`Поръчка ${id} е приета`);
  await page.goto(`/api/decision?id=${id}&sig=${sig}&a=decline`);
  await expect(page.locator('.badge')).toContainText('Вече е приета');
});
