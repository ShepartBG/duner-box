/*
 * POST /api/order — приема поръчка за вкъщи (АЕЦ Козлодуй):
 *   1) записва я като „чакаща“ в хранилището (api/store.js) — собственикът я вижда в панела (dunerbox.bg/admin);
 *   2) праща на клиента „Получихме поръчката ти“ с номера на поръчката.
 * Собственикът не получава имейли — приема/отказва от панела (api/admin.js), а клиентът получава имейл с решението.
 *
 * Работи в Cloudflare Worker-а (cloudflare/worker.js) и локално през server.js.
 *
 * Променливи на средата:
 *   RESEND_API_KEY   — ключ за Resend (без него: тестов режим, имейлите само се логват)
 *   RESEND_FROM      — подател, напр. "Duner Box <poruchki@dunerbox.bg>" (домейнът трябва да е верифициран в Resend)
 *   ALLOWED_ORIGINS  — разрешени сайтове за CORS, разделени със запетая
 *   ALLOW_TEST_CLOCK — "1" само в тестове: позволява хедър x-test-now
 *   ORDER_SECRET     — таен ключ за подписване на входа в панела (задължителен при истински имейли)
 */
const crypto = require('crypto');
const D = require('../menu-data.js');
const B = D.BUSINESS;

const DEFAULT_FROM = 'Duner Box <onboarding@resend.dev>';
const DEFAULT_ORIGINS = 'https://shepartbg.github.io,http://localhost:5173,http://localhost:5174';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fmt = (n) => `${n.toFixed(2).replace('.', ',')} €`;
// в HTML имейлите: сумата и „€“ никога на отделни редове (и в пощи, които не четат CSS)
const money = (n) => fmt(n).replace(' ', '&nbsp;');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* --- лимит на заявки (на инстанция) --- */
const hits = new Map();
function rateLimited(ip, nowMs) {
  const list = (hits.get(ip) || []).filter((t) => nowMs - t < 10 * 60 * 1000);
  list.push(nowMs);
  hits.set(ip, list);
  return list.length > 6;
}

function fail(status, error, message, extra) {
  return { status, json: { ok: false, error, message, ...extra } };
}

/* --- валидиране и изчисляване на поръчката --- */
function buildOrder(body, now) {
  const errors = {};
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const address = String(body.address || '').trim().replace(/\s+/g, ' ');
  const notes = String(body.notes || '').trim().slice(0, 600);

  if (name.length < 3 || name.length > 80) errors.name = 'Въведи имената си.';
  const digits = phone.replace(/[^\d]/g, '');
  if (!/^[+\d\s()\-/]+$/.test(phone) || digits.length < 9 || digits.length > 15) errors.phone = 'Въведи валиден телефон.';
  if (!EMAIL_RE.test(email) || email.length > 120) errors.email = 'Въведи валиден имейл.';
  if (address.length < 3 || address.length > 150) errors.address = 'Напиши къде да доставим (сграда, отдел, етаж).';
  if (body.aec !== true) errors.aec = 'Доставяме само в АЕЦ Козлодуй — потвърди адреса.';
  if (body.consent !== true) errors.consent = 'Нужно е съгласие за обработка на данните.';

  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length) errors.items = 'Количката е празна.';
  if (raw.length > 40) errors.items = 'Твърде много позиции.';

  const lines = [];
  for (const r of raw.slice(0, 40)) {
    const item = D.MENU.find((m) => m.id === r.id);
    const size = Number.isInteger(r.size) ? r.size : 0;
    const qty = Number(r.qty);
    const flavor = item && item.flavors ? r.flavor : undefined;
    const opts = item ? D.normalizeOptions(item, r.opts) : null;
    if (!item || !opts || size < 0 || size >= item.prices.length || !Number.isInteger(qty) || qty < 1 || qty > D.ORDER.maxQty
      || (item.flavors && !item.flavors.includes(flavor))) {
      errors.items = 'Невалидна позиция в количката.';
      continue;
    }
    const sizeLabel = [item.prices.length > 1 ? D.sizeLabels(item)[size] : '', flavor || ''].filter(Boolean).join(', ');
    const base = item.prices[size];
    const price = base == null ? null : D.round2(base + opts.extraPrice);
    lines.push({
      id: item.id, name: item.name, sizeLabel, qty, options: D.optionsSummary(item, opts),
      price, sum: price == null ? null : D.round2(price * qty),
    });
  }

  const total = D.round2(lines.reduce((a, l) => a + (l.sum || 0), 0));
  const hasUnpriced = lines.some((l) => l.price == null);
  const stamp = new Intl.DateTimeFormat('bg-BG', {
    timeZone: D.TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(now);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: D.TZ, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).reduce((o, x) => ({ ...o, [x.type]: x.value }), {});
  const id = `DB-${p.day}${p.month}-${p.hour}${p.minute}-${crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`;

  return { errors, order: { id, name, phone, email, address, notes, lines, total, hasUnpriced, stamp } };
}

/* --- таен ключ (подписва входа в панела) --- */
const DEV_SECRET = 'dev-only-secret-not-for-production';
function orderSecret(env) {
  if (env.ORDER_SECRET) return env.ORDER_SECRET;
  if (env.RESEND_API_KEY) return null; // продукция без таен ключ — забранено
  return DEV_SECRET;
}

/* --- имейли --- */
function itemsTable(o) {
  const rows = o.lines.map((l) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #3a2a1e;color:#f4e7d7">${l.qty} × ${esc(l.name)}${l.sizeLabel ? ` <span style="color:#ff8a2a">(${esc(l.sizeLabel)})</span>` : ''}${l.options ? `<br><span style="font-size:13px;color:#ffc21a">${esc(l.options)}</span>` : ''}</td>
      <td style="padding:8px 0;border-bottom:1px solid #3a2a1e;color:#f4e7d7;text-align:right;white-space:nowrap" nowrap>${l.sum == null ? 'цена при доставка' : money(l.sum)}</td>
    </tr>`).join('');
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px">
    ${rows}
    <tr>
      <td style="padding:12px 8px 0 0;color:#ffc21a;font-weight:bold">Общо${o.hasUnpriced ? ' (без позициите с цена при доставка)' : ''}</td>
      <td style="padding:12px 0 0;color:#ffc21a;font-weight:bold;text-align:right;font-size:18px;white-space:nowrap" nowrap>${money(o.total)}</td>
    </tr>
  </table>`;
}

function shell(title, inner) {
  return `<!doctype html><html lang="bg"><body style="margin:0;background:#0b0705;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0705;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#1a110c;border:1px solid #3a2a1e;border-radius:14px">
        <tr><td style="padding:22px 24px;border-bottom:3px solid #ff5a1f;font-size:24px;font-weight:bold;letter-spacing:2px;color:#ffffff">DUNER <span style="color:#ffc21a">BOX</span></td></tr>
        <tr><td style="padding:24px;color:#f4e7d7;font-size:15px;line-height:1.55">
          <h1 style="margin:0 0 14px;font-size:22px;color:#ffc21a">${title}</h1>
          ${inner}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #3a2a1e;color:#b9a491;font-size:12px">${esc(B.brand)} · ${esc(B.address)}<br>${esc(B.company)} · ЕИК ${esc(B.eik)}${B.phone ? ` · тел. ${esc(B.phone)}` : ''}</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

/* Клиент: веднага след поръчката */
function customerReceivedEmail(o) {
  const html = shell('Получихме поръчката ти!', `
    <p style="margin:0 0 12px">Здравей, ${esc(o.name.split(' ')[0])}! Поръчката ти е при нас.</p>
    <p style="margin:0 0 18px">Номер: <b style="color:#ffc21a">${esc(o.id)}</b><br>
      <b>Очаквай потвърждение по имейл до няколко минути.</b> След потвърждението доставяме до <b>${D.ORDER.deliveryMinutes} минути</b> в ${D.ORDER.area}.<br>
      Доставка до: <b>${esc(o.address)}</b><br>
      Плащане: <b>${D.ORDER.payment}</b>.</p>
    ${itemsTable(o)}
    ${o.notes ? `<p style="margin:18px 0 0;color:#b9a491"><b>Твоите бележки:</b> ${esc(o.notes).replace(/\n/g, '<br>')}</p>` : ''}`);
  const text = [
    `Получихме поръчката ти! Номер: ${o.id}`,
    `Доставка до: ${o.address}`,
    'Очаквай потвърждение по имейл до няколко минути.',
    '', ...o.lines.map(lineText), '', `Общо: ${fmt(o.total)}`,
  ].join('\n');
  return { subject: `Duner Box: получихме поръчка ${o.id}`, html, text };
}

/* Клиент: собственикът прие */
function customerAcceptedEmail(o) {
  const html = shell('Поръчката ти е приета! 🔥', `
    <p style="margin:0 0 12px">Здравей, ${esc(o.name.split(' ')[0])}! Шишът вече се върти за теб.</p>
    <p style="margin:0 0 18px">Номер: <b style="color:#ffc21a">${esc(o.id)}</b><br>
      Доставка: <b>${esc(o.address)}</b> (${D.ORDER.area}), до <b>${D.ORDER.deliveryMinutes} минути</b>.<br>
      Плащане: <b>${D.ORDER.payment}</b> — приготви <b style="white-space:nowrap">${money(o.total)}</b>.</p>
    ${itemsTable(o)}
    <p style="margin:18px 0 0;color:#b9a491">Ако нещо не е наред, просто отговори на този имейл.</p>`);
  const text = [
    `Поръчката ти е приета! Номер: ${o.id}`,
    `Доставка: ${o.address} (${D.ORDER.area}), до ${D.ORDER.deliveryMinutes} минути. Плащане: ${D.ORDER.payment}.`,
    '', ...o.lines.map(lineText), '', `Общо: ${fmt(o.total)}`,
  ].join('\n');
  return { subject: `Duner Box: поръчка ${o.id} е приета — идва до ${D.ORDER.deliveryMinutes} мин.`, html, text };
}

/* Клиент: собственикът отказа */
function customerDeclinedEmail(o, reason) {
  const html = shell('Съжаляваме, поръчката не може да бъде изпълнена', `
    <p style="margin:0 0 12px">Здравей, ${esc(o.name.split(' ')[0])}!</p>
    <p style="margin:0 0 14px">За съжаление днес не можем да изпълним поръчка <b style="color:#ffc21a">${esc(o.id)}</b>.</p>
    ${reason ? `<div style="margin:0 0 16px;padding:12px 14px;background:#2a1a10;border-left:3px solid #ffc21a;border-radius:6px"><b>Причина:</b> ${esc(reason).replace(/\n/g, '<br>')}</div>` : ''}
    <p style="margin:0;color:#b9a491">Не е таксувано нищо. Ще се радваме да поръчаш отново или да минеш на бара на ул. Търговска 77.</p>`);
  const text = [
    `За съжаление не можем да изпълним поръчка ${o.id}.`,
    reason ? `Причина: ${reason}` : '',
    'Не е таксувано нищо. Ще се радваме да поръчаш отново.',
  ].filter(Boolean).join('\n');
  return { subject: `Duner Box: поръчка ${o.id} не може да бъде изпълнена`, html, text };
}

function lineText(l) {
  return `${l.qty} x ${l.name}${l.sizeLabel ? ` (${l.sizeLabel})` : ''}${l.options ? ` [${l.options}]` : ''} — ${l.sum == null ? 'цена при доставка' : fmt(l.sum)}`;
}

/*
 * Адрес за отговор: винаги на нашия домейн (poruchki@… се препраща към собственика през Cloudflare Email Routing).
 * Reply-To към безплатна поща (abv.bg, gmail.com) при подател от dunerbox.bg сваля много точки при спам филтрите.
 */
function replyAddress(env) {
  const from = env.RESEND_FROM || DEFAULT_FROM;
  const m = from.match(/<([^>]+)>/);
  return env.REPLY_TO || (m ? m[1] : from);
}

function withHeaders(env, msg) {
  const reply = replyAddress(env);
  return {
    ...msg,
    reply_to: reply,
    headers: { 'List-Unsubscribe': `<mailto:${reply}?subject=unsubscribe>`, ...(msg.headers || {}) },
  };
}

async function sendEmail(env, fetchImpl, msg) {
  msg = withHeaders(env, msg);
  const r = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text().catch(() => '')}`);
  return r.json();
}

/* --- основна логика (без HTTP), удобна за тестове --- */
async function handleOrder(body, { now = new Date(), env = process.env, fetchImpl = globalThis.fetch, ip = '', store, baseUrl = 'https://dunerbox.bg', recordedAt = now } = {}) {
  if (!body || typeof body !== 'object') return fail(400, 'bad_request', 'Невалидна заявка.');
  // капан за ботове: истинските клиенти не виждат това поле
  if (body.website) return { status: 200, json: { ok: true, orderId: 'DB-0000', total: 0 } };

  const win = D.orderWindow(now);
  if (!win.open) {
    return fail(403, 'closed', `Поръчки се приемат само от 8:00 до 10:00 (пон–пет).`, { secondsToOpen: win.secondsToOpen });
  }
  // ограничение на заявките (изключено само за тестовия сървър с ALLOW_TEST_CLOCK)
  if (ip && env.ALLOW_TEST_CLOCK !== '1' && rateLimited(ip, now.getTime())) return fail(429, 'rate_limited', 'Твърде много опити. Опитай пак след малко.');

  const { errors, order } = buildOrder(body, now);
  if (Object.keys(errors).length) return fail(422, 'invalid', 'Провери полетата.', { fields: errors });

  if (!orderSecret(env)) {
    console.error('[order] липсва ORDER_SECRET');
    return fail(500, 'config', 'Поръчките временно не работят. Опитай по-късно.');
  }
  if (store) {
    try {
      // recordedAt = истинският час (тестовият часовник служи само за прозореца 8–10)
      await store.set(order.id, { ...order, status: 'pending', createdAt: recordedAt.toISOString() });
    } catch (e) {
      console.error('[order] store failed', e.message);
      return fail(500, 'store_failed', 'Поръчката не можа да бъде записана. Опитай отново след минута.');
    }
  }

  // поръчката вече е в панела — имейл получава само клиентът (номер на поръчката)
  const cust = customerReceivedEmail(order);
  const from = env.RESEND_FROM || DEFAULT_FROM;
  const emails = [{ from, to: [order.email], subject: cust.subject, html: cust.html, text: cust.text }];

  if (!env.RESEND_API_KEY) {
    console.log(`[order] ТЕСТОВ РЕЖИМ (няма RESEND_API_KEY) — ${order.id}, ${fmt(order.total)}`);
    return { status: 200, json: { ok: true, orderId: order.id, total: order.total, dryRun: true, pending: true }, emails };
  }

  let customerEmailSent = true;
  try {
    await sendEmail(env, fetchImpl, emails[0]);
  } catch (e) {
    customerEmailSent = false;
    console.error('[order] customer email failed', e.message);
  }
  return { status: 200, json: { ok: true, orderId: order.id, total: order.total, customerEmailSent, pending: true }, emails };
}

/* --- HTTP обвивка (Vercel / Node http) --- */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 50 * 1024) throw new Error('too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(res, status, json) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(json));
}

async function handler(req, res) {
  const env = process.env;
  const origin = req.headers.origin;
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim());
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method' });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { ok: false, error: 'bad_request', message: 'Невалидна заявка.' }); }

  let now = new Date();
  if (env.ALLOW_TEST_CLOCK === '1' && req.headers['x-test-now']) now = new Date(req.headers['x-test-now']);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

  const { fileStore, localOrdersDir } = require('./store.js');
  const store = fileStore(localOrdersDir());
  const baseUrl = `http://${req.headers.host}`;
  const result = await handleOrder(body, { now, env, ip, store, baseUrl, recordedAt: new Date() });
  return send(res, result.status, result.json);
}

module.exports = handler;
module.exports.handleOrder = handleOrder;
module.exports.buildOrder = buildOrder;
Object.assign(module.exports, {
  orderSecret, sendEmail, shell, itemsTable, esc, fmt, DEFAULT_FROM,
  customerAcceptedEmail, customerDeclinedEmail,
});
