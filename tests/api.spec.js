// Тестове на сървърната логика за поръчки (без браузър, с фалшив Resend)
const { test, expect } = require('@playwright/test');
const { handleOrder } = require('../api/order.js');
const D = require('../menu-data.js');


const OPEN = new Date('2026-10-12T09:15:00+03:00');   // понеделник 9:15
const CLOSED = new Date('2026-10-12T10:00:00+03:00'); // понеделник 10:00 — вече затворено
const SAT = new Date('2026-10-17T09:30:00+03:00');    // събота 9:30

const good = (over = {}) => ({
  name: 'Мария Иванова', phone: '+359 888 123 456', email: 'maria@example.com', notes: 'Корпус 3', consent: true, aec: true,
  items: [
    { id: 'sand-tarikatski', size: 1, qty: 2, opts: { ingredients: ['зеле', 'домат'], sauces: ['чеснов'], extras: ['extra-kofte'] } },
    { id: 'side-fries', size: 0, qty: 1, opts: { sauces: ['кетчуп'] } },
    { id: 'extra-egg', size: 0, qty: 1 },
    { id: 'drink-hell', size: 0, flavor: 'черна череша', qty: 2 },
  ],
  ...over,
});

function fakeResend(fail = []) {
  const sent = [];
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    sent.push({ url, auth: opts.headers.Authorization, body });
    const i = sent.length - 1;
    if (fail.includes(i)) return { ok: false, status: 500, text: async () => 'boom' };
    return { ok: true, json: async () => ({ id: `email_${i}` }) };
  };
  return { sent, fetchImpl };
}
const ENV = { RESEND_API_KEY: 're_test', RESEND_FROM: 'Duner Box <poruchki@dunerbox.bg>', OWNER_EMAIL: 'jeki.1997@abv.bg', ORDER_SECRET: 'test-secret' };

test('изпраща 2 имейла: към собственика и към клиента', async () => {
  const { sent, fetchImpl } = fakeResend();
  const r = await handleOrder(good(), { now: OPEN, env: ENV, fetchImpl, ip: '1.1.1.1' });
  expect(r.status).toBe(200);
  expect(r.json.ok).toBe(true);
  expect(r.json.total).toBe(22.5); // 2 × (6 + 2 кюфте) + 2,50 + 1 яйце + 2 × 1,50
  expect(sent).toHaveLength(2);
  expect(sent.every((s) => s.url === 'https://api.resend.com/emails' && s.auth === 'Bearer re_test')).toBe(true);

  const [owner, cust] = sent.map((s) => s.body);
  expect(owner.to).toEqual(['jeki.1997@abv.bg']);
  // „Отговор“ винаги към нашия домейн — Reply-To към безплатна поща сваля точки при спам филтрите
  expect(owner.reply_to).toBe('poruchki@dunerbox.bg');
  expect(cust.reply_to).toBe('poruchki@dunerbox.bg');
  expect(owner.headers['List-Unsubscribe']).toBe('<mailto:poruchki@dunerbox.bg?subject=unsubscribe>');
  expect(owner.subject).toMatch(/^Duner Box: нова поръчка/);
  expect(owner.html).toContain('mailto:maria@example.com');
  expect(owner.from).toBe('Duner Box <poruchki@dunerbox.bg>');
  expect(owner.subject).toContain('нова поръчка');
  expect(owner.subject).toContain('22,50 €');
  expect(owner.html).toContain('2 × Хел');
  expect(owner.html).toContain('черна череша');
  expect(owner.html).toContain('Мария Иванова');
  expect(owner.html).toContain('+359 888 123 456');
  expect(owner.html).toContain('Корпус 3');
  expect(owner.html).toContain('2 × Тарикатски');
  expect(owner.html).toContain('голям');
  expect(owner.html).toContain('с зеле, домат · сосове: чеснов · + телешко кюфте');
  expect(owner.html).toContain('сосове: кетчуп');
  expect(owner.text).toContain('[с зеле, домат · сосове: чеснов · + телешко кюфте]');

  expect(cust.to).toEqual(['maria@example.com']);
  expect(cust.subject).toContain('получихме поръчка');
  expect(cust.html).toContain('Очаквай потвърждение');
  expect(owner.html).toContain('✅ Приемам');
  expect(owner.html).toContain('❌ Отказвам');
  expect(owner.subject).not.toMatch(/\p{Extended_Pictographic}/u); // без емоджи в заглавието
  expect(cust.html).toContain('АЕЦ Козлодуй');
  expect(cust.html).toContain('30 минути');
  expect(cust.html).toContain('само в брой');
});

test('цените се смятат на сървъра — подправени цени от клиента се игнорират', async () => {
  const { sent, fetchImpl } = fakeResend();
  const r = await handleOrder(good({ items: [{ id: 'duner-royal', size: 0, qty: 1, price: 0.01 }], total: 0.01 }),
    { now: OPEN, env: ENV, fetchImpl, ip: '1.1.1.2' });
  expect(r.json.total).toBe(8);
  expect(sent[0].body.html).toContain('8,00 €');
});

test('отказва поръчки извън 8:00–10:00 и в събота', async () => {
  for (const now of [CLOSED, SAT, new Date('2026-10-12T07:59:59+03:00')]) {
    const { sent, fetchImpl } = fakeResend();
    const r = await handleOrder(good(), { now, env: ENV, fetchImpl, ip: '1.1.1.3' });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('closed');
    expect(sent).toHaveLength(0);
  }
});

test('приема поръчки от 8:00', async () => {
  const { fetchImpl } = fakeResend();
  const r = await handleOrder(good(), { now: new Date('2026-10-12T08:00:00+03:00'), env: ENV, fetchImpl, ip: '1.1.1.9' });
  expect(r.status).toBe(200);
});

test('валидира задължителните полета', async () => {
  const { sent, fetchImpl } = fakeResend();
  const r = await handleOrder(good({ name: '', phone: 'abc', email: 'x@', consent: false }), { now: OPEN, env: ENV, fetchImpl, ip: '1.1.1.4' });
  expect(r.status).toBe(422);
  expect(Object.keys(r.json.fields).sort()).toEqual(['consent', 'email', 'name', 'phone']);
  expect(sent).toHaveLength(0);
});

test('отказва празна количка, непознати позиции и невалидни количества', async () => {
  const cases = [
    [],
    [{ id: 'nope', size: 0, qty: 1 }],
    [{ id: 'duner-small', size: 3, qty: 1 }],
    [{ id: 'duner-small', size: 0, qty: 0 }],
    [{ id: 'duner-small', size: 0, qty: 99 }],
    [{ id: 'drink-hell', size: 0, qty: 1 }],
    [{ id: 'drink-hell', size: 0, flavor: 'бира', qty: 1 }],
    [{ id: 'duner-small', size: 0, qty: 1, opts: { ingredients: ['пица'] } }],
    [{ id: 'duner-small', size: 0, qty: 1, opts: { sauces: ['люто', 'люто'] } }],
    [{ id: 'duner-small', size: 0, qty: 1, opts: { extras: ['drink-cola'] } }],
    [{ id: 'side-fries', size: 0, qty: 1, opts: { ingredients: ['зеле'] } }],
    [{ id: 'drink-cola', size: 0, qty: 1, opts: { sauces: ['люто'] } }],
    [{ id: 'duner-small', size: 0, qty: 1, opts: { ingredients: 'зеле' } }],
  ];
  for (const [i, items] of cases.entries()) {
    const { fetchImpl } = fakeResend();
    const r = await handleOrder(good({ items }), { now: OPEN, env: ENV, fetchImpl, ip: `2.2.2.${i}` });
    expect(r.status, JSON.stringify(items)).toBe(422);
    expect(r.json.fields.items).toBeTruthy();
  }
});

test('екранира HTML в данните на клиента', async () => {
  const { sent, fetchImpl } = fakeResend();
  await handleOrder(good({ name: 'Иван <script>x</script>', notes: '<img src=x onerror=alert(1)>' }), { now: OPEN, env: ENV, fetchImpl, ip: '1.1.1.5' });
  expect(sent[0].body.html).not.toContain('<script>');
  expect(sent[0].body.html).not.toContain('<img src=x');
  expect(sent[0].body.html).toContain('&lt;script&gt;');
});

test('ако имейлът към собственика не мине, клиентът получава грешка', async () => {
  const { sent, fetchImpl } = fakeResend([0]);
  const r = await handleOrder(good(), { now: OPEN, env: ENV, fetchImpl, ip: '1.1.1.6' });
  expect(r.status).toBe(502);
  expect(sent).toHaveLength(1);
});

test('ако само потвърждението към клиента не мине, поръчката пак е приета', async () => {
  const { fetchImpl } = fakeResend([1]);
  const r = await handleOrder(good(), { now: OPEN, env: ENV, fetchImpl, ip: '1.1.1.7' });
  expect(r.status).toBe(200);
  expect(r.json.customerEmailSent).toBe(false);
});

test('без RESEND_API_KEY работи в тестов режим и не праща нищо', async () => {
  const { sent, fetchImpl } = fakeResend();
  const r = await handleOrder(good(), { now: OPEN, env: {}, fetchImpl, ip: '1.1.1.8' });
  expect(r.status).toBe(200);
  expect(r.json.dryRun).toBe(true);
  expect(r.emails[0].to).toEqual(['dunerbox77@abv.bg']);
  expect(sent).toHaveLength(0);
});

test('капанът за ботове връща фалшив успех без имейли', async () => {
  const { sent, fetchImpl } = fakeResend();
  const r = await handleOrder(good({ website: 'http://spam' }), { now: OPEN, env: ENV, fetchImpl, ip: '1.1.1.9' });
  expect(r.status).toBe(200);
  expect(sent).toHaveLength(0);
});

test('ограничава прекалено много поръчки от един адрес', async () => {
  const { fetchImpl } = fakeResend();
  const statuses = [];
  for (let i = 0; i < 8; i++) statuses.push((await handleOrder(good(), { now: OPEN, env: ENV, fetchImpl, ip: '9.9.9.9' })).status);
  expect(statuses.slice(0, 6).every((s) => s === 200)).toBe(true);
  expect(statuses[7]).toBe(429);
});

test('тестовият сървър никога не праща истински имейли', async ({ request }) => {
  // playwright.config.js задава празен RESEND_API_KEY за сървъра на тестовете
  const r = await request.post('/api/order', {
    headers: { 'x-test-now': '2026-10-12T09:30:00+03:00' },
    data: good({ email: 'nobody@example.com' }),
  });
  expect((await r.json()).dryRun).toBe(true);
});

test('.env и скриптовете не се сервират', async ({ request }) => {
  for (const p of ['/.env', '/.env.example', '/scripts/test-email.js']) {
    expect((await request.get(p)).status(), p).toBe(403);
  }
});

test('имейлите съдържат данните на фирмата', async () => {
  const sent = [];
  const fetchImpl = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({}) }; };
  await handleOrder(good(), { now: OPEN, env: ENV, fetchImpl, ip: '3.3.3.3' });
  for (const m of sent) {
    expect(m.html).toContain('Станислав Стоянов-94 ЕООД');
    expect(m.html).toContain('ЕИК 206587193');
  }
});

test('цената на добавките се смята на сървъра', async () => {
  const { sent, fetchImpl } = fakeResend();
  const r = await handleOrder(good({ items: [
    { id: 'duner-small', size: 0, qty: 3, price: 0.01, opts: { ingredients: [], sauces: [], extras: ['extra-kofte', 'extra-egg', 'extra-cheddar'] } },
  ] }), { now: OPEN, env: ENV, fetchImpl, ip: '4.4.4.4' });
  expect(r.status).toBe(200);
  expect(r.json.total).toBe(24); // 3 × (4 + 2 + 1 + 1)
  expect(sent[0].body.html).toContain('без съставки · без сос · + телешко кюфте, + чедър, + яйце');
});

/* --- Cloudflare Worker (продукцията) --- */
const { pathToFileURL } = require('url');
const path = require('path');
const loadWorker = () => import(pathToFileURL(path.join(__dirname, '..', 'cloudflare', 'worker.js')).href)
  .then((m) => (m.default && m.default.fetch ? m.default : m.default.default));

function fakeKV() {
  const data = new Map();
  const puts = [];
  return {
    data, puts,
    async get(k, type) { const v = data.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v, opts) { data.set(k, v); puts.push({ k, opts }); },
    async list({ prefix }) { return { keys: [...data.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
  };
}
const workerEnv = (extra = {}) => ({
  ORDERS: fakeKV(),
  ASSETS: { fetch: async () => new Response('static', { status: 200 }) },
  RESEND_API_KEY: '', ORDER_SECRET: 'worker-secret', ...extra,
});
const post = (url, body, headers = {}) => new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

test('Worker: поръчка → запис в KV с изтичане след 90 дни → решение', async () => {
  const w = await loadWorker();
  const env = workerEnv({ ALLOW_TEST_CLOCK: '1' });
  const r = await w.fetch(post('https://dunerbox.bg/api/order', JSON.stringify(good()), { 'x-test-now': '2026-10-12T09:30:00+03:00', 'cf-connecting-ip': '5.5.5.5' }), env);
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(j.ok && j.pending && j.dryRun).toBe(true);
  expect(env.ORDERS.puts[0].opts.expirationTtl).toBe(90 * 24 * 3600);
  const saved = JSON.parse(env.ORDERS.data.get(j.orderId));
  expect(saved.status).toBe('pending');

  const { sign } = require('../api/order.js');
  const sig = sign(j.orderId, 'worker-secret');
  const page = await w.fetch(new Request(`https://dunerbox.bg/api/decision?id=${j.orderId}&sig=${sig}&a=accept`), env);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('Потвърди — приемам');
  const done = await w.fetch(new Request('https://dunerbox.bg/api/decision', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id: j.orderId, sig, a: 'accept' }).toString(),
  }), env);
  expect(await done.text()).toContain('е приета');
  expect(JSON.parse(env.ORDERS.data.get(j.orderId)).status).toBe('accepted');
});

test('Worker: тестовият часовник работи само с ALLOW_TEST_CLOCK=1; грешни заявки; www → dunerbox.bg', async () => {
  const w = await loadWorker();
  const req = () => post('https://dunerbox.bg/api/order', JSON.stringify(good()), { 'x-test-now': '2026-10-12T09:30:00+03:00', 'cf-connecting-ip': '6.6.6.6' });
  const real = D.orderWindow().open;
  expect((await w.fetch(req(), workerEnv())).status).toBe(real ? 200 : 403); // продукция: решава истинският час
  expect((await w.fetch(req(), workerEnv({ ALLOW_TEST_CLOCK: '1' }))).status).toBe(200);
  expect((await w.fetch(new Request('https://dunerbox.bg/api/order'), workerEnv())).status).toBe(405);
  expect((await w.fetch(post('https://dunerbox.bg/api/order', '{нещо'), workerEnv())).status).toBe(400);
  const big = post('https://dunerbox.bg/api/order', 'x'.repeat(60 * 1024));
  expect((await w.fetch(big, workerEnv())).status).toBe(413);
  const red = await w.fetch(new Request('https://www.dunerbox.bg/privacy.html?a=1'), workerEnv());
  expect(red.status).toBe(301);
  expect(red.headers.get('location')).toBe('https://dunerbox.bg/privacy.html?a=1');
  expect(await (await w.fetch(new Request('https://dunerbox.bg/'), workerEnv())).text()).toBe('static');
});

test('Worker: панел — вход, поръчките от KV, приемане', async () => {
  const w = await loadWorker();
  const env = workerEnv({ ALLOW_TEST_CLOCK: '1', ADMIN_PASSWORD: 'панел' });
  const o = await (await w.fetch(post('https://dunerbox.bg/api/order', JSON.stringify(good()), { 'x-test-now': '2026-10-12T09:30:00+03:00', 'cf-connecting-ip': '8.8.8.1' }), env)).json();
  const bad = await w.fetch(post('https://dunerbox.bg/api/admin/login', JSON.stringify({ password: 'не' }), { 'cf-connecting-ip': '8.8.8.2' }), env);
  expect(bad.status).toBe(401);
  const { token } = await (await w.fetch(post('https://dunerbox.bg/api/admin/login', JSON.stringify({ password: 'панел' }), { 'cf-connecting-ip': '8.8.8.2' }), env)).json();
  const auth = { Authorization: `Bearer ${token}` };
  expect((await w.fetch(new Request('https://dunerbox.bg/api/admin/orders?day=2026-10-12'), env)).status).toBe(401);
  // в истинския KV list() закъснява до минута — новата поръчка трябва да се вижда веднага през индекса за деня
  env.ORDERS.list = async () => ({ keys: [], list_complete: true });
  const list = await (await w.fetch(new Request('https://dunerbox.bg/api/admin/orders?day=2026-10-12', { headers: auth }), env)).json();
  expect(list.orders.map((x) => x.id)).toEqual([o.orderId]);
  const r = await w.fetch(post('https://dunerbox.bg/api/admin/decide', JSON.stringify({ id: o.orderId, action: 'accept' }), auth), env);
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect(JSON.parse(env.ORDERS.data.get(o.orderId)).status).toBe('accepted');
});

test('поръчка без потвърждение за АЕЦ се отказва', async () => {
  const { sent, fetchImpl } = fakeResend();
  const r = await handleOrder(good({ aec: false }), { now: OPEN, env: ENV, fetchImpl, ip: '7.7.7.8' });
  expect(r.status).toBe(422);
  expect(r.json.fields.aec).toContain('АЕЦ Козлодуй');
  expect(sent).toHaveLength(0);
});
