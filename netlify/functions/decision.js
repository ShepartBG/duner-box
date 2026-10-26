/*
 * Netlify Function: /api/decision (пренасочено в netlify.toml) — собственикът приема/отказва поръчка.
 * Логиката е в api/decision.js.
 */
const { handleDecision } = require('../../api/decision.js');
const { netlifyStore } = require('../../api/store.js');

exports.handler = async (event) => {
  let params = event.queryStringParameters || {};
  if (event.httpMethod === 'POST') {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
    params = Object.fromEntries(new URLSearchParams(raw.slice(0, 20000)));
  }
  const store = netlifyStore(event);
  // тестов часовник — само ако ALLOW_TEST_CLOCK=1 (никога в продукция)
  let now = new Date();
  const fake = event.headers['x-test-now'];
  if (process.env.ALLOW_TEST_CLOCK === '1' && fake && !Number.isNaN(Date.parse(fake))) now = new Date(fake);
  const r = await handleDecision({ method: event.httpMethod, params }, { env: process.env, store, now });
  return {
    statusCode: r.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    body: r.html,
  };
};
