/*
 * Хранилище за поръчките (чакащи / приети / отказани).
 *   - в Cloudflare: Workers KV (в cloudflare/worker.js)
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
    async list(prefix) { return [...m.keys()].filter((k) => k.startsWith(prefix)); },
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
    async list(prefix) {
      try {
        return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((k) => k.startsWith(prefix));
      } catch { return []; }
    },
  };
}

module.exports = { memoryStore, fileStore };
