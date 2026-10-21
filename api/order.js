/*
 * POST /api/order — приема поръчка за вкъщи (АЕЦ Козлодуй) и изпраща 2 имейла през Resend:
 *   1) към собственика (нова поръчка), 2) към клиента (потвърждение).
 *
 * Работи като Vercel serverless функция и локално през server.js.
 *
 * Променливи на средата:
 *   RESEND_API_KEY   — ключ за Resend (без него: тестов режим, имейлите само се логват)
 *   RESEND_FROM      — подател, напр. "Duner Box <poruchki@dunerbox.bg>" (домейнът трябва да е верифициран в Resend)
 *   OWNER_EMAIL      — къде да идват поръчките (по подразбиране тестовият адрес)
 *   ALLOWED_ORIGINS  — разрешени сайтове за CORS, разделени със запетая
 *   ALLOW_TEST_CLOCK — "1" само в тестове: позволява хедър x-test-now
 */
const D = require('../menu-data.js');

const DEFAULT_OWNER = 'jeki.1997@abv.bg';
const DEFAULT_FROM = 'Duner Box <onboarding@resend.dev>';
const DEFAULT_ORIGINS = 'https://shepartbg.github.io,http://localhost:5173,http://localhost:5174';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fmt = (n) => `${n.toFixed(2).replace('.', ',')} €`;
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
  const notes = String(body.notes || '').trim().slice(0, 600);

  if (name.length < 3 || name.length > 80) errors.name = 'Въведи имената си.';
  const digits = phone.replace(/[^\d]/g, '');
  if (!/^[+\d\s()\-/]+$/.test(phone) || digits.length < 9 || digits.length > 15) errors.phone = 'Въведи валиден телефон.';
  if (!EMAIL_RE.test(email) || email.length > 120) errors.email = 'Въведи валиден имейл.';
  if (body.consent !== true) errors.consent = 'Нужно е съгласие за обработка на данните.';

  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length) errors.items = 'Количката е празна.';
  if (raw.length > 40) errors.items = 'Твърде много позиции.';

  const lines = [];
  for (const r of raw.slice(0, 40)) {
    const item = D.MENU.find((m) => m.id === r.id);
    const size = Number.isInteger(r.size) ? r.size : 0;
    const qty = Number(r.qty);
    if (!item || size < 0 || size >= item.prices.length || !Number.isInteger(qty) || qty < 1 || qty > D.ORDER.maxQty) {
      errors.items = 'Невалидна позиция в количката.';
      continue;
    }
    const cat = D.CATEGORIES.find((c) => c.id === item.cat);
    const sizeLabel = item.prices.length > 1 && cat.sizes ? cat.sizes[size] : '';
    const price = item.prices[size];
    lines.push({
      id: item.id, name: item.name, sizeLabel, qty,
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
  const id = `DB-${p.day}${p.month}-${p.hour}${p.minute}-${Math.floor(100 + Math.random() * 900)}`;

  return { errors, order: { id, name, phone, email, notes, lines, total, hasUnpriced, stamp } };
}

/* --- имейли --- */
function itemsTable(o) {
  const rows = o.lines.map((l) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #3a2a1e;color:#f4e7d7">${l.qty} × ${esc(l.name)}${l.sizeLabel ? ` <span style="color:#ff8a2a">(${esc(l.sizeLabel)})</span>` : ''}</td>
      <td style="padding:8px 0;border-bottom:1px solid #3a2a1e;color:#f4e7d7;text-align:right;white-space:nowrap">${l.sum == null ? 'цена при доставка' : fmt(l.sum)}</td>
    </tr>`).join('');
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px">
    ${rows}
    <tr>
      <td style="padding:12px 0 0;color:#ffc21a;font-weight:bold">Общо${o.hasUnpriced ? ' (без позициите с цена при доставка)' : ''}</td>
      <td style="padding:12px 0 0;color:#ffc21a;font-weight:bold;text-align:right;font-size:18px">${fmt(o.total)}</td>
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
        <tr><td style="padding:16px 24px;border-top:1px solid #3a2a1e;color:#b9a491;font-size:12px">Duner Box · ул. Търговска 77, 3320 Козлодуй</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function ownerEmail(o) {
  const html = shell(`Нова поръчка ${esc(o.id)}`, `
    <p style="margin:0 0 6px"><b>Име:</b> ${esc(o.name)}</p>
    <p style="margin:0 0 6px"><b>Телефон:</b> <a href="tel:${esc(o.phone.replace(/[^\d+]/g, ''))}" style="color:#ffc21a">${esc(o.phone)}</a></p>
    <p style="margin:0 0 6px"><b>Имейл:</b> <a href="mailto:${esc(o.email)}" style="color:#ffc21a">${esc(o.email)}</a></p>
    <p style="margin:0 0 6px"><b>Доставка:</b> ${D.ORDER.area}, до ${D.ORDER.deliveryMinutes} мин. · плащане ${D.ORDER.payment}</p>
    <p style="margin:0 0 16px"><b>Приета:</b> ${esc(o.stamp)}</p>
    ${o.notes ? `<div style="margin:0 0 18px;padding:12px 14px;background:#2a1a10;border-left:3px solid #ffc21a;border-radius:6px"><b>Описание:</b><br>${esc(o.notes).replace(/\n/g, '<br>')}</div>` : ''}
    ${itemsTable(o)}`);
  const text = [
    `Нова поръчка ${o.id} (${o.stamp})`,
    `Име: ${o.name}`, `Телефон: ${o.phone}`, `Имейл: ${o.email}`,
    o.notes ? `Описание: ${o.notes}` : '',
    '', ...o.lines.map((l) => `${l.qty} x ${l.name}${l.sizeLabel ? ` (${l.sizeLabel})` : ''} — ${l.sum == null ? 'цена при доставка' : fmt(l.sum)}`),
    '', `Общо: ${fmt(o.total)}`,
  ].filter((x) => x !== null).join('\n');
  return { subject: `🔥 Нова поръчка ${o.id} · ${fmt(o.total)} · ${o.name}`, html, text };
}

function customerEmail(o) {
  const html = shell('Поръчката ти е приета!', `
    <p style="margin:0 0 12px">Здравей, ${esc(o.name.split(' ')[0])}! Шишът вече се върти за теб.</p>
    <p style="margin:0 0 18px">Номер на поръчката: <b style="color:#ffc21a">${esc(o.id)}</b><br>
      Доставка: <b>${D.ORDER.area}</b>, до <b>${D.ORDER.deliveryMinutes} минути</b>.<br>
      Плащане: <b>${D.ORDER.payment}</b>.</p>
    ${itemsTable(o)}
    ${o.notes ? `<p style="margin:18px 0 0;color:#b9a491"><b>Твоето описание:</b> ${esc(o.notes).replace(/\n/g, '<br>')}</p>` : ''}
    <p style="margin:18px 0 0;color:#b9a491">Ако нещо не е наред, просто отговори на този имейл.</p>`);
  const text = [
    `Поръчката ти е приета! Номер: ${o.id}`,
    `Доставка: ${D.ORDER.area}, до ${D.ORDER.deliveryMinutes} минути. Плащане: ${D.ORDER.payment}.`,
    '', ...o.lines.map((l) => `${l.qty} x ${l.name}${l.sizeLabel ? ` (${l.sizeLabel})` : ''} — ${l.sum == null ? 'цена при доставка' : fmt(l.sum)}`),
    '', `Общо: ${fmt(o.total)}`,
  ].join('\n');
  return { subject: `Duner Box: поръчка ${o.id} е приета`, html, text };
}

async function sendEmail(env, fetchImpl, msg) {
  const r = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text().catch(() => '')}`);
  return r.json();
}

/* --- основна логика (без HTTP), удобна за тестове --- */
async function handleOrder(body, { now = new Date(), env = process.env, fetchImpl = globalThis.fetch, ip = '' } = {}) {
  if (!body || typeof body !== 'object') return fail(400, 'bad_request', 'Невалидна заявка.');
  // капан за ботове: истинските клиенти не виждат това поле
  if (body.website) return { status: 200, json: { ok: true, orderId: 'DB-0000', total: 0 } };

  const win = D.orderWindow(now);
  if (!win.open) {
    return fail(403, 'closed', `Поръчки се приемат само от 9:00 до 10:00 (пон–пет).`, { secondsToOpen: win.secondsToOpen });
  }
  if (ip && rateLimited(ip, now.getTime())) return fail(429, 'rate_limited', 'Твърде много опити. Опитай пак след малко.');

  const { errors, order } = buildOrder(body, now);
  if (Object.keys(errors).length) return fail(422, 'invalid', 'Провери полетата.', { fields: errors });

  const owner = ownerEmail(order);
  const cust = customerEmail(order);
  const from = env.RESEND_FROM || DEFAULT_FROM;
  const ownerTo = env.OWNER_EMAIL || DEFAULT_OWNER;
  const emails = [
    { from, to: [ownerTo], reply_to: order.email, subject: owner.subject, html: owner.html, text: owner.text },
    { from, to: [order.email], reply_to: ownerTo, subject: cust.subject, html: cust.html, text: cust.text },
  ];

  if (!env.RESEND_API_KEY) {
    console.log(`[order] ТЕСТОВ РЕЖИМ (няма RESEND_API_KEY) — ${order.id}, ${fmt(order.total)}\n${owner.text}`);
    return { status: 200, json: { ok: true, orderId: order.id, total: order.total, dryRun: true }, emails };
  }

  try {
    await sendEmail(env, fetchImpl, emails[0]);
  } catch (e) {
    console.error('[order] owner email failed', e.message);
    return fail(502, 'email_failed', 'Поръчката не можа да бъде изпратена. Опитай отново след минута.');
  }
  let customerEmailSent = true;
  try {
    await sendEmail(env, fetchImpl, emails[1]);
  } catch (e) {
    customerEmailSent = false;
    console.error('[order] customer email failed', e.message);
  }
  return { status: 200, json: { ok: true, orderId: order.id, total: order.total, customerEmailSent }, emails };
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

  const result = await handleOrder(body, { now, env, ip });
  return send(res, result.status, result.json);
}

module.exports = handler;
module.exports.handleOrder = handleOrder;
module.exports.buildOrder = buildOrder;
