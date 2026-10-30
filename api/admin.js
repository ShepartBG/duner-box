/*
 * /api/admin/* — панелът за поръчки (dunerbox.bg/admin).
 *
 *   POST /api/admin/login   { password }            → { token }  (валиден 180 дни)
 *   GET  /api/admin/orders?day=YYYY-MM-DD           → поръчките за деня, най-новите първи
 *   POST /api/admin/decide  { id, action, reason }  → приема / отказва (клиентът получава имейл)
 *   POST /api/admin/status  { id, status }          → „delivered“ за приета поръчка
 *
 * Паролата е в ADMIN_PASSWORD (wrangler secret). Без нея панелът е изключен.
 * Токенът е подписан с ORDER_SECRET и с отпечатък на паролата — смяна на паролата изхвърля всички устройства.
 */
const crypto = require('crypto');
const O = require('./order.js');
const { applyDecision } = require('./decision.js');

const TOKEN_DAYS = 180;

/* --- лимит на опитите за вход (на инстанция): 8 за 15 мин --- */
const attempts = new Map();
function tooManyLogins(ip, nowMs) {
  const list = (attempts.get(ip) || []).filter((t) => nowMs - t < 15 * 60 * 1000);
  attempts.set(ip, list);
  return list.length >= 8;
}
function noteFailedLogin(ip, nowMs) {
  attempts.set(ip, [...(attempts.get(ip) || []), nowMs]);
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function tokenSig(exp, env) {
  return crypto.createHmac('sha256', O.orderSecret(env)).update(`admin|${exp}|${sha(env.ADMIN_PASSWORD).slice(0, 16)}`).digest('hex');
}
function makeToken(env, nowMs) {
  const exp = nowMs + TOKEN_DAYS * 24 * 3600 * 1000;
  return `${exp}.${tokenSig(exp, env)}`;
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function validToken(token, env, nowMs) {
  const [exp, sig] = String(token || '').split('.');
  if (!/^\d+$/.test(exp || '') || Number(exp) < nowMs || !sig) return false;
  return safeEqual(sig, tokenSig(exp, env));
}

const ok = (json) => ({ status: 200, json: { ok: true, ...json } });
const err = (status, error, message) => ({ status, json: { ok: false, error, message } });

// поръчките за ден: номерът започва с DB-ДДММ- (поръчките живеят 90 дни, така че годината не се бърка)
function dayPrefix(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  return m ? `DB-${m[3]}${m[2]}-` : null;
}
function sofiaDay(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// само полетата, нужни на панела
function view(o) {
  const { id, name, phone, email, notes, lines, total, hasUnpriced, stamp, status, createdAt, decidedAt, decidedStamp, reason, deliveredAt } = o;
  return { id, name, phone, email, notes, lines, total, hasUnpriced, stamp, status, createdAt, decidedAt, decidedStamp, reason, deliveredAt };
}

async function handleAdmin({ method, action, query = {}, body = {}, token, ip = '' }, { env = process.env, store, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (!env.ADMIN_PASSWORD || !O.orderSecret(env)) return err(503, 'disabled', 'Панелът още не е настроен.');
  const nowMs = now.getTime();

  if (action === 'login') {
    if (method !== 'POST') return err(405, 'method');
    if (tooManyLogins(ip, nowMs)) return err(429, 'rate_limited', 'Твърде много опити. Изчакай 15 минути.');
    if (!safeEqual(sha(body.password || ''), sha(env.ADMIN_PASSWORD))) {
      noteFailedLogin(ip, nowMs);
      return err(401, 'wrong_password', 'Грешна парола.');
    }
    return ok({ token: makeToken(env, nowMs) });
  }

  if (!validToken(token, env, nowMs)) return err(401, 'auth', 'Влез отново.');

  if (action === 'orders') {
    const day = query.day || sofiaDay(now);
    const prefix = dayPrefix(day);
    if (!prefix) return err(400, 'bad_day', 'Невалидна дата.');
    const keys = await store.list(prefix);
    const orders = (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean).map(view);
    orders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return ok({ day, orders });
  }

  if (method !== 'POST') return err(405, 'method');
  const id = String(body.id || '');
  if (!/^DB-\d{4}-\d{4}-[0-9A-F]{4}$/.test(id)) return err(400, 'bad_id', 'Невалиден номер.');

  if (action === 'decide') {
    const act = body.action === 'accept' || body.action === 'decline' ? body.action : null;
    if (!act) return err(400, 'bad_action');
    const reason = act === 'decline' ? String(body.reason || '').trim().slice(0, 300) : '';
    const r = await applyDecision(id, act, reason, { env, store, fetchImpl, now });
    if (r.missing) return err(404, 'missing', 'Няма такава поръчка.');
    if (r.already) return { status: 409, json: { ok: false, error: 'already', message: 'Вече е решено.', order: view(r.already) } };
    return ok({ order: view(r.order), emailSent: r.sent });
  }

  if (action === 'status') {
    if (body.status !== 'delivered') return err(400, 'bad_status');
    const o = await store.get(id);
    if (!o) return err(404, 'missing', 'Няма такава поръчка.');
    if (o.status !== 'accepted') return { status: 409, json: { ok: false, error: 'not_accepted', message: 'Само приета поръчка може да е доставена.', order: view(o) } };
    const updated = { ...o, status: 'delivered', deliveredAt: now.toISOString() };
    await store.set(id, updated);
    return ok({ order: view(updated) });
  }

  return err(404, 'not_found');
}

/* --- локален HTTP (server.js) --- */
async function handler(req, res) {
  const { fileStore } = require('./store.js');
  const store = fileStore(require('path').join(__dirname, '..', '.data', 'orders'));
  const url = new URL(req.url, 'http://x');
  let body = {};
  if (req.method === 'POST') {
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 20000) break; }
    try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
  }
  let now = new Date();
  const fake = req.headers['x-test-now'];
  if (process.env.ALLOW_TEST_CLOCK === '1' && fake && !Number.isNaN(Date.parse(fake))) now = new Date(fake);
  const r = await handleAdmin({
    method: req.method,
    action: url.pathname.replace('/api/admin/', ''),
    query: Object.fromEntries(url.searchParams),
    body,
    token: String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
    ip: req.socket.remoteAddress || '',
  }, { store, now });
  res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(r.json));
}

module.exports = handler;
module.exports.handleAdmin = handleAdmin;
