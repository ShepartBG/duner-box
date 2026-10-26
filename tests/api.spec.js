// Тестове на сървърната логика за поръчки (без браузър, с фалшив Resend)
const { test, expect } = require('@playwright/test');
const { handleOrder } = require('../api/order.js');

test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'desktop', 'еднократно, не зависи от устройството'); });

const OPEN = new Date('2026-10-12T09:15:00+03:00');   // понеделник 9:15
const CLOSED = new Date('2026-10-12T10:00:00+03:00'); // понеделник 10:00 — вече затворено
const SAT = new Date('2026-10-17T09:30:00+03:00');    // събота 9:30

const good = (over = {}) => ({
  name: 'Мария Иванова', phone: '+359 888 123 456', email: 'maria@example.com', notes: 'Корпус 3', consent: true,
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
const ENV = { RESEND_API_KEY: 're_test', RESEND_FROM: 'Duner Box <poruchki@dunerbox.bg>', OWNER_EMAIL: 'jeki.1997@abv.bg' };

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
  expect(owner.reply_to).toBe('maria@example.com');
  expect(owner.from).toBe('Duner Box <poruchki@dunerbox.bg>');
  expect(owner.subject).toContain('Нова поръчка');
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
  expect(cust.subject).toContain('е приета');
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

test('отказва поръчки извън 9:00–10:00 и в събота', async () => {
  for (const now of [CLOSED, SAT, new Date('2026-10-12T08:59:59+03:00')]) {
    const { sent, fetchImpl } = fakeResend();
    const r = await handleOrder(good(), { now, env: ENV, fetchImpl, ip: '1.1.1.3' });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('closed');
    expect(sent).toHaveLength(0);
  }
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
  expect(r.emails[0].to).toEqual(['jeki.1997@abv.bg']);
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

test('Netlify обвивката връща същите отговори', async () => {
  const { handler } = require('../netlify/functions/order.js');
  const old = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = ''; // без истински имейли
  try {
    expect((await handler({ httpMethod: 'GET', headers: {} })).statusCode).toBe(405);
    expect((await handler({ httpMethod: 'POST', headers: {}, body: '{нещо' })).statusCode).toBe(400);
    const r = await handler({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '7.7.7.7' }, body: JSON.stringify(good()) });
    // реалният час решава: в 9:00–10:00 (пон–пет) е 200, иначе 403 „closed“
    expect([200, 403]).toContain(r.statusCode);
    expect(r.headers['Content-Type']).toContain('application/json');
    const j = JSON.parse(r.body);
    if (r.statusCode === 403) expect(j.error).toBe('closed');
    else expect(j.dryRun).toBe(true);
  } finally {
    process.env.RESEND_API_KEY = old;
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
