/*
 * Cloudflare Worker за dunerbox.bg.
 *   /api/order    → api/order.js    (поръчка + имейли през Resend)
 *   /api/decision → api/decision.js (собственикът приема/отказва)
 *   всичко друго  → статичните файлове от dist/
 * Поръчките се пазят в Workers KV (binding ORDERS) и се изтриват автоматично след 90 дни.
 * Тайни (wrangler secret put): RESEND_API_KEY, RESEND_FROM, OWNER_EMAIL, ORDER_SECRET.
 */
import order from '../api/order.js';
import decision from '../api/decision.js';

const { handleOrder } = order;
const { handleDecision } = decision;

const kvStore = (kv) => ({
  get: (k) => kv.get(k, 'json'),
  // поръчките се изтриват автоматично след 90 дни (политика за поверителност)
  set: (k, v) => kv.put(k, JSON.stringify(v), { expirationTtl: 90 * 24 * 3600 }),
});

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

// Тестов часовник: само ако ALLOW_TEST_CLOCK=1 (единствено в тестовия Worker, никога в продукция)
function clock(request, env) {
  const fake = request.headers.get('x-test-now');
  if (env.ALLOW_TEST_CLOCK === '1' && fake && !Number.isNaN(Date.parse(fake))) return new Date(fake);
  return new Date();
}

async function orderRoute(request, env, url) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method' });
  const raw = await request.text();
  if (raw.length > 50 * 1024) return json(413, { ok: false, error: 'too_large' });
  let body;
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return json(400, { ok: false, error: 'bad_request', message: 'Невалидна заявка.' });
  }
  const result = await handleOrder(body, {
    now: clock(request, env),
    env,
    ip: request.headers.get('cf-connecting-ip') || '',
    store: kvStore(env.ORDERS),
    baseUrl: url.origin,
    recordedAt: new Date(),
  });
  return json(result.status, result.json);
}

async function decisionRoute(request, env, url) {
  let params = Object.fromEntries(url.searchParams);
  if (request.method === 'POST') {
    const raw = (await request.text()).slice(0, 20000);
    params = Object.fromEntries(new URLSearchParams(raw));
  }
  const r = await handleDecision({ method: request.method, params }, { env, store: kvStore(env.ORDERS), now: clock(request, env) });
  return new Response(r.html, {
    status: r.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.dunerbox.bg') {
      return Response.redirect(`https://dunerbox.bg${url.pathname}${url.search}`, 301);
    }
    if (url.pathname === '/api/order') return orderRoute(request, env, url);
    if (url.pathname === '/api/decision') return decisionRoute(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
