/*
 * /api/decision — собственикът приема или отказва поръчка.
 *
 *   GET  ?id&sig&a=accept|decline  → страница с поръчката и бутон „Потвърди“ (нищо не се променя!)
 *   POST id, sig, a, reason        → записва решението и праща имейл на клиента
 *
 * GET само показва страница, защото пощенските програми понякога „отварят“ линковете
 * сами (антивирусна проверка) — така поръчка не може да се приеме без натискане на бутона.
 */
const crypto = require('crypto');
const O = require('./order.js');

const EXPIRE_HOURS = 3;
const { esc, fmt } = O;

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="bg"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} — Duner Box</title>
<style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0b0705;color:#f4e7d7;font:16px/1.55 system-ui,-apple-system,'Segoe UI',Arial,sans-serif;display:flex;justify-content:center;padding:24px 14px}
  .card{width:100%;max-width:560px;background:#1a110c;border:1px solid #3a2a1e;border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6)}
  .top{padding:18px 22px;border-bottom:3px solid #ff5a1f;font-weight:800;letter-spacing:2px;font-size:22px}.top b{color:#ffc21a}
  .in{padding:22px}h1{margin:0 0 12px;font-size:22px;color:#ffc21a}p{margin:0 0 10px}
  table{width:100%;border-collapse:collapse;margin:14px 0}td{padding:8px 0;border-bottom:1px solid #3a2a1e;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}
  .o{font-size:13px;color:#ffc21a}.tot td{border:0;color:#ffc21a;font-weight:800;font-size:18px}
  .muted{color:#b9a491;font-size:14px}.note{padding:10px 12px;background:#2a1a10;border-left:3px solid #ffc21a;border-radius:6px;margin:10px 0}
  button,.btn{display:block;width:100%;padding:16px;border:0;border-radius:999px;font-size:18px;font-weight:800;color:#fff;cursor:pointer;text-align:center;text-decoration:none;margin-top:14px}
  .ok{background:#2e9e4f}.no{background:#c22d18}.alt{background:transparent;border:1px solid #3a2a1e;color:#b9a491;font-size:15px;font-weight:600}
  textarea{width:100%;min-height:90px;margin-top:8px;padding:12px;border-radius:12px;border:1px solid #5a3a22;background:#0b0705;color:#f4e7d7;font:inherit}
  .badge{display:inline-block;padding:4px 12px;border-radius:999px;font-weight:700;font-size:14px}.b-ok{background:#2e9e4f}.b-no{background:#c22d18}
</style></head><body><div class="card"><div class="top">DUNER <b>BOX</b></div><div class="in">${body}</div></div></body></html>`;
  return { status, html };
}

function orderSummary(o) {
  const rows = o.lines.map((l) => `<tr><td>${l.qty} × ${esc(l.name)}${l.sizeLabel ? ` (${esc(l.sizeLabel)})` : ''}${l.options ? `<br><span class="o">${esc(l.options)}</span>` : ''}</td><td>${l.sum == null ? '—' : fmt(l.sum)}</td></tr>`).join('');
  return `
    <p><b>${esc(o.name)}</b> · <a href="tel:${esc(o.phone.replace(/[^\d+]/g, ''))}" style="color:#ffc21a">${esc(o.phone)}</a></p>
    <p class="muted">Получена: ${esc(o.stamp)}</p>
    ${o.notes ? `<div class="note"><b>Описание:</b> ${esc(o.notes).replace(/\n/g, '<br>')}</div>` : ''}
    <table>${rows}<tr class="tot"><td>Общо</td><td>${fmt(o.total)}</td></tr></table>`;
}

function validSig(id, sig, secret) {
  if (!id || !sig || !secret) return false;
  const want = Buffer.from(O.sign(id, secret));
  const got = Buffer.from(String(sig));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function decidedPage(o) {
  const ok = o.status === 'accepted';
  return page('Вече е решено', `
    <h1>Поръчка ${esc(o.id)}</h1>
    <p><span class="badge ${ok ? 'b-ok' : 'b-no'}">${ok ? '✅ Вече е приета' : '❌ Вече е отказана'}</span></p>
    <p class="muted">Решението е взето на ${esc(o.decidedStamp || '')}. Не е нужно нищо повече.</p>
    ${o.reason ? `<div class="note"><b>Причина:</b> ${esc(o.reason)}</div>` : ''}
    ${orderSummary(o)}`);
}

async function handleDecision({ method, params }, { env = process.env, store, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const id = String(params.id || '');
  const action = params.a === 'decline' ? 'decline' : params.a === 'accept' ? 'accept' : '';
  const secret = O.orderSecret(env);
  if (!action || !validSig(id, params.sig, secret)) {
    return page('Невалиден линк', '<h1>Невалиден линк</h1><p>Линкът е грешен или непълен. Отвори го отново от имейла с поръчката.</p>', 403);
  }
  const o = await store.get(id);
  if (!o) return page('Няма такава поръчка', `<h1>Няма такава поръчка</h1><p>Поръчка ${esc(id)} не е намерена.</p>`, 404);
  if (o.status !== 'pending') return decidedPage(o);

  const expired = now - new Date(o.createdAt) > EXPIRE_HOURS * 3600 * 1000;
  if (expired) {
    return page('Изтекла поръчка', `<h1>Поръчка ${esc(id)} е изтекла</h1>
      <p>Минали са повече от ${EXPIRE_HOURS} часа. Ако все пак ще я изпълните, обадете се на клиента.</p>${orderSummary(o)}`, 410);
  }

  const hidden = `<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="sig" value="${esc(params.sig)}">`;
  const other = `${'/api/decision'}?id=${encodeURIComponent(id)}&sig=${esc(params.sig)}&a=${action === 'accept' ? 'decline' : 'accept'}`;

  if (method !== 'POST') {
    if (action === 'accept') {
      return page('Приемане на поръчка', `
        <h1>Приемаш ли поръчка ${esc(id)}?</h1>${orderSummary(o)}
        <form method="post" action="/api/decision">${hidden}<input type="hidden" name="a" value="accept">
          <button class="ok" type="submit">✅ Потвърди — приемам</button></form>
        <a class="btn alt" href="${other}">Искам да откажа</a>`);
    }
    return page('Отказ на поръчка', `
      <h1>Отказваш поръчка ${esc(id)}?</h1>${orderSummary(o)}
      <form method="post" action="/api/decision">${hidden}<input type="hidden" name="a" value="decline">
        <label for="r"><b>Причина</b> <span class="muted">(по желание — клиентът ще я види)</span></label>
        <textarea id="r" name="reason" maxlength="300" placeholder="напр. Свърши телешкото кюфте / Много поръчки в момента"></textarea>
        <button class="no" type="submit">❌ Откажи поръчката</button></form>
      <a class="btn alt" href="${other}">Искам да приема</a>`);
  }

  // POST — записваме решението
  const reason = action === 'decline' ? String(params.reason || '').trim().slice(0, 300) : '';
  const decidedStamp = new Intl.DateTimeFormat('bg-BG', { timeZone: 'Europe/Sofia', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(now);
  const updated = { ...o, status: action === 'accept' ? 'accepted' : 'declined', decidedAt: now.toISOString(), decidedStamp, reason };
  // проверка отново точно преди запис (двоен клик / двама души едновременно)
  const fresh = await store.get(id);
  if (fresh && fresh.status !== 'pending') return decidedPage(fresh);
  await store.set(id, updated);

  const mail = action === 'accept' ? O.customerAcceptedEmail(o) : O.customerDeclinedEmail(o, reason);
  const from = env.RESEND_FROM || O.DEFAULT_FROM;
  let sent = true;
  if (env.RESEND_API_KEY) {
    try {
      await O.sendEmail(env, fetchImpl, { from, to: [o.email], subject: mail.subject, html: mail.html, text: mail.text });
    } catch (e) {
      sent = false;
      console.error('[decision] customer email failed', e.message);
    }
  } else {
    console.log(`[decision] ТЕСТОВ РЕЖИМ — ${id}: ${updated.status}`);
  }

  const warn = sent ? '' : `<div class="note"><b>Внимание:</b> имейлът до клиента не тръгна. Обади се на ${esc(o.name)}: <a href="tel:${esc(o.phone.replace(/[^\d+]/g, ''))}" style="color:#ffc21a">${esc(o.phone)}</a></div>`;
  if (action === 'accept') {
    return page('Поръчката е приета', `<h1>✅ Поръчка ${esc(id)} е приета</h1>
      <p>${sent ? 'Клиентът получи имейл, че поръчката идва до 30 минути.' : ''}</p>${warn}${orderSummary(o)}`);
  }
  return page('Поръчката е отказана', `<h1>❌ Поръчка ${esc(id)} е отказана</h1>
    <p>${sent ? 'Клиентът получи имейл с извинение' + (reason ? ' и причината.' : '.') : ''}</p>${warn}`);
}

/* --- локален HTTP (server.js) --- */
async function handler(req, res) {
  const { fileStore } = require('./store.js');
  const store = fileStore(require('path').join(__dirname, '..', '.data', 'orders'));
  const url = new URL(req.url, 'http://x');
  let params = Object.fromEntries(url.searchParams);
  if (req.method === 'POST') {
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 20000) break; }
    params = Object.fromEntries(new URLSearchParams(raw));
  }
  let now = new Date();
  const fake = req.headers['x-test-now'];
  if (process.env.ALLOW_TEST_CLOCK === '1' && fake && !Number.isNaN(Date.parse(fake))) now = new Date(fake);
  const r = await handleDecision({ method: req.method, params }, { store, now });
  res.writeHead(r.status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  res.end(r.html);
}

module.exports = handler;
module.exports.handleDecision = handleDecision;
