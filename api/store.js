/*
 * Хранилище за поръчките (чакащи / приети / отказани).
 *   - в Netlify: Netlify Blobs (безплатно, без база данни)
 *   - локално:   файлове в .data/orders (не се качват в GitHub)
 *   - в тестове: в паметта
 */
const fs = require('fs');
const path = require('path');

function memoryStore() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async set(k, v) { m.set(k, JSON.stringify(v)); },
  };
}

function fileStore(dir) {
  const file = (k) => path.join(dir, String(k).replace(/[^A-Za-z0-9-]/g, '_') + '.json');
  return {
    async get(k) {
      try { return JSON.parse(fs.readFileSync(file(k), 'utf8')); } catch { return null; }
    },
    async set(k, v) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file(k), JSON.stringify(v, null, 2));
    },
  };
}

/* Netlify Functions (Lambda формат): трябва да се подаде event-ът, за да се свърже хранилището */
function netlifyStore(event) {
  if (!event || !event.blobs) {
    // извън Netlify (локални тестове на обвивката) — в паметта; в Netlify без хранилище — грешка
    if (process.env.NETLIFY) throw new Error('Netlify Blobs не е свързан');
    return memoryStore();
  }
  const blobs = require('@netlify/blobs');
  blobs.connectLambda(event);
  const s = blobs.getStore('orders');
  return {
    async get(k) { return s.get(k, { type: 'json' }); },
    async set(k, v) { await s.setJSON(k, v); },
  };
}

module.exports = { memoryStore, fileStore, netlifyStore };
