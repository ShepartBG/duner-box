/*
 * Решение по поръчка (приета / отказана) — вика се от панела (api/admin.js).
 * Записва решението и праща имейл на клиента с резултата.
 */
const O = require('./order.js');

// поръчки, по които в момента се записва решение (двоен клик / две устройства в една и съща секунда)
const inFlight = new Set();

/*
 * Връща { already } ако някой вече е решил (или решава в момента), { missing } ако няма такава поръчка, иначе { order, sent }.
 */
async function applyDecision(id, action, reason, opts = {}) {
  if (inFlight.has(id)) return { already: (await opts.store.get(id)) || { id, status: 'pending' } };
  inFlight.add(id);
  try {
    return await decide(id, action, reason, opts);
  } finally {
    inFlight.delete(id);
  }
}

async function decide(id, action, reason, { env = process.env, store, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const o = await store.get(id);
  if (!o) return { missing: true };
  if (o.status !== 'pending') return { already: o };
  const decidedStamp = new Intl.DateTimeFormat('bg-BG', { timeZone: 'Europe/Sofia', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(now);
  const updated = { ...o, status: action === 'accept' ? 'accepted' : 'declined', decidedAt: now.toISOString(), decidedStamp, reason };
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
  return { order: updated, sent };
}

module.exports = { applyDecision };
