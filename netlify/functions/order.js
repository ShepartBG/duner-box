/*
 * Netlify Function: POST /api/order (пренасочено в netlify.toml).
 * Цялата логика е в api/order.js — тук е само обвивката за Netlify.
 * Настройки (Site settings → Environment variables): RESEND_API_KEY, RESEND_FROM, OWNER_EMAIL.
 */
const { handleOrder } = require('../../api/order.js');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method' });
  if ((event.body || '').length > 50 * 1024) return json(413, { ok: false, error: 'too_large' });

  let body;
  try {
    body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'bad_request', message: 'Невалидна заявка.' });
  }

  const ip = event.headers['x-nf-client-connection-ip'] || String(event.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const result = await handleOrder(body, { now: new Date(), env: process.env, ip });
  return json(result.status, result.json);
};
