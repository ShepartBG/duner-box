// Панелът за поръчки — сървърната част (/api/admin/*), без браузър
const { test, expect } = require('@playwright/test');
const { handleOrder } = require('../api/order.js');
const { handleAdmin } = require('../api/admin.js');
const { memoryStore } = require('../api/store.js');

const ENV = { RESEND_API_KEY: 're_test', RESEND_FROM: 'Duner Box <poruchki@dunerbox.bg>', ORDER_SECRET: 'test-secret', ADMIN_PASSWORD: 'тайна-123' };
const OPEN = new Date('2026-10-12T09:15:00+03:00');
const body = (name = 'Мария Иванова') => ({
  name, phone: '0888 123 456', email: 'maria@example.com', notes: 'Корпус 3', consent: true, aec: true,
  items: [{ id: 'duner-large', size: 0, qty: 1 }],
});

let ipN = 0;
function setup() {
  const sent = [];
  const fetchImpl = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({}) }; };
  const store = memoryStore();
  const ctx = { env: ENV, store, fetchImpl, now: OPEN };
  const call = (req) => handleAdmin({ ip: `20.0.0.${++ipN}`, ...req }, ctx);
  const order = (name, now = OPEN) => handleOrder(body(name), { now, env: ENV, fetchImpl, store, ip: `30.0.0.${++ipN}` });
  return { sent, store, call, order, ctx };
}
async function login(s) {
  const r = await s.call({ method: 'POST', action: 'login', body: { password: 'тайна-123' } });
  return r.json.token;
}

test('без ADMIN_PASSWORD панелът е изключен', async () => {
  const r = await handleAdmin({ method: 'POST', action: 'login', body: { password: '' } }, { env: { ...ENV, ADMIN_PASSWORD: '' }, store: memoryStore() });
  expect(r.status).toBe(503);
});

test('вход: грешна парола → 401, правилна → токен', async () => {
  const s = setup();
  const bad = await s.call({ method: 'POST', action: 'login', body: { password: 'грешна' } });
  expect(bad.status).toBe(401);
  expect(bad.json.token).toBeUndefined();
  const token = await login(s);
  expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/);
});

test('без токен или с подправен токен няма достъп до поръчките', async () => {
  const s = setup();
  expect((await s.call({ method: 'GET', action: 'orders', query: { day: '2026-10-12' } })).status).toBe(401);
  const token = await login(s);
  const fake = token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
  expect((await s.call({ method: 'GET', action: 'orders', query: { day: '2026-10-12' }, token: fake })).status).toBe(401);
  // удължен срок с чужд подпис
  const [, sig] = token.split('.');
  expect((await s.call({ method: 'GET', action: 'orders', token: `99999999999999.${sig}` })).status).toBe(401);
});

test('смяна на паролата изхвърля всички устройства', async () => {
  const s = setup();
  const token = await login(s);
  const r = await handleAdmin({ method: 'GET', action: 'orders', query: { day: '2026-10-12' }, token }, { ...s.ctx, env: { ...ENV, ADMIN_PASSWORD: 'нова-парола' } });
  expect(r.status).toBe(401);
});

test('след 8 грешни опита входът се заключва за 15 минути', async () => {
  const s = setup();
  const ip = '40.0.0.1';
  for (let i = 0; i < 8; i++) {
    expect((await handleAdmin({ method: 'POST', action: 'login', body: { password: 'x' }, ip }, s.ctx)).status).toBe(401);
  }
  // дори правилната парола не минава, докато е заключено
  expect((await handleAdmin({ method: 'POST', action: 'login', body: { password: 'тайна-123' }, ip }, s.ctx)).status).toBe(429);
  const later = new Date(OPEN.getTime() + 16 * 60 * 1000);
  expect((await handleAdmin({ method: 'POST', action: 'login', body: { password: 'тайна-123' }, ip }, { ...s.ctx, now: later })).status).toBe(200);
});

test('показва поръчките само за избрания ден, най-новите първи', async () => {
  const s = setup();
  const a = await s.order('Първи Клиент', new Date('2026-10-12T08:05:00+03:00'));
  const b = await s.order('Втори Клиент', new Date('2026-10-12T09:40:00+03:00'));
  await s.order('Друг Ден', new Date('2026-10-13T09:00:00+03:00'));
  const token = await login(s);
  const r = await s.call({ method: 'GET', action: 'orders', query: { day: '2026-10-12' }, token });
  expect(r.status).toBe(200);
  expect(r.json.orders.map((o) => o.id)).toEqual([b.json.orderId, a.json.orderId]);
  const o = r.json.orders[0];
  expect(o).toMatchObject({ name: 'Втори Клиент', status: 'pending', phone: '0888 123 456', notes: 'Корпус 3', total: 5 });
  expect(o.lines[0]).toMatchObject({ name: expect.stringContaining('Дюнер'), qty: 1 });
  expect((await s.call({ method: 'GET', action: 'orders', query: { day: 'вчера' }, token })).status).toBe(400);
});

test('приемане от панела: клиентът получава имейл, второ решение не минава', async () => {
  const s = setup();
  const { json } = await s.order();
  const token = await login(s);
  s.sent.length = 0;
  const r = await s.call({ method: 'POST', action: 'decide', body: { id: json.orderId, action: 'accept' }, token });
  expect(r.status).toBe(200);
  expect(r.json.order.status).toBe('accepted');
  expect(r.json.emailSent).toBe(true);
  expect(s.sent).toHaveLength(1);
  expect(s.sent[0].to).toEqual(['maria@example.com']);
  expect(s.sent[0].subject).toContain('е приета');

  const again = await s.call({ method: 'POST', action: 'decide', body: { id: json.orderId, action: 'decline' }, token });
  expect(again.status).toBe(409);
  expect(again.json.order.status).toBe('accepted');
  expect(s.sent).toHaveLength(1);
});

test('отказ от панела с причина', async () => {
  const s = setup();
  const { json } = await s.order();
  const token = await login(s);
  s.sent.length = 0;
  const r = await s.call({ method: 'POST', action: 'decide', body: { id: json.orderId, action: 'decline', reason: 'Много поръчки в момента' }, token });
  expect(r.json.order).toMatchObject({ status: 'declined', reason: 'Много поръчки в момента' });
  expect(s.sent[0].html).toContain('Много поръчки в момента');
});

test('причината за отказ се екранира в имейла до клиента', async () => {
  const s = setup();
  const { json } = await s.order();
  const token = await login(s);
  s.sent.length = 0;
  await s.call({ method: 'POST', action: 'decide', body: { id: json.orderId, action: 'decline', reason: 'Свърши кюфтето <b>' }, token });
  expect(s.sent[0].html).toContain('Свърши кюфтето &lt;b&gt;');
  expect(s.sent[0].html).not.toContain('<b>Свърши');
});

test('две устройства едновременно: само едното решение минава, клиентът получава един имейл', async () => {
  const s = setup();
  const { json } = await s.order();
  const token = await login(s);
  s.sent.length = 0;
  const [a, b] = await Promise.all([
    s.call({ method: 'POST', action: 'decide', body: { id: json.orderId, action: 'accept' }, token }),
    s.call({ method: 'POST', action: 'decide', body: { id: json.orderId, action: 'accept' }, token }),
  ]);
  expect([a.status, b.status].sort()).toEqual([200, 409]);
  expect(s.sent).toHaveLength(1);
});

test('„Доставена“ — само за приета поръчка', async () => {
  const s = setup();
  const { json } = await s.order();
  const token = await login(s);
  const early = await s.call({ method: 'POST', action: 'status', body: { id: json.orderId, status: 'delivered' }, token });
  expect(early.status).toBe(409);
  await s.call({ method: 'POST', action: 'decide', body: { id: json.orderId, action: 'accept' }, token });
  const r = await s.call({ method: 'POST', action: 'status', body: { id: json.orderId, status: 'delivered' }, token });
  expect(r.status).toBe(200);
  expect(r.json.order.status).toBe('delivered');
  expect(r.json.order.deliveredAt).toBeTruthy();
});

test('невалиден номер или действие → грешка, нищо не се променя', async () => {
  const s = setup();
  const token = await login(s);
  expect((await s.call({ method: 'POST', action: 'decide', body: { id: '../x', action: 'accept' }, token })).status).toBe(400);
  expect((await s.call({ method: 'POST', action: 'decide', body: { id: 'DB-1210-0915-ABCD', action: 'accept' }, token })).status).toBe(404);
  const { json } = await s.order();
  expect((await s.call({ method: 'POST', action: 'decide', body: { id: json.orderId, action: 'delete' }, token })).status).toBe(400);
  expect((await s.store.get(json.orderId)).status).toBe('pending');
});

test('собственикът не получава имейли — нито при поръчка, нито при решение', async () => {
  const s = setup();
  const { json } = await s.order();
  const token = await login(s);
  await s.call({ method: 'POST', action: 'decide', body: { id: json.orderId, action: 'accept' }, token });
  await s.call({ method: 'POST', action: 'status', body: { id: json.orderId, status: 'delivered' }, token });
  expect(s.sent.map((m) => m.to[0])).toEqual(['maria@example.com', 'maria@example.com']);
});
