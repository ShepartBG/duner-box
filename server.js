// Минимален статичен сървър:
//   npm start    -> node server.js        (само сървър)
//   npm run dev  -> node server.js --dev  (сървър + автоматично презареждане при промяна)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;
const DEV = process.argv.includes('--dev');
const IGNORED = /node_modules|tests|test-results|screenshots|playwright-report|\.git/;
// тези папки не се сервират като статични файлове
const PRIVATE = /^(api|photos|node_modules|tests|test-results|screenshots|playwright-report|\.git)([\\/]|$)/;
const orderApi = require('./api/order.js');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

// --- Live reload (само в dev режим) ---
const clients = new Set();
const RELOAD_SNIPPET = `<script>(() => {
  const es = new EventSource('/__reload');
  es.onmessage = () => location.reload();
})();</script>`;

if (DEV) {
  let timer;
  fs.watch(ROOT, { recursive: true }, (_event, name) => {
    if (!name || IGNORED.test(name)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`  ↻ промяна: ${name}`);
      clients.forEach((res) => res.write('data: reload\n\n'));
    }, 100);
  });
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  if (DEV && url === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (url === '/api/order') return orderApi(req, res);

  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT) || PRIVATE.test(path.relative(ROOT, file))) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не е намерено'); }
    const ext = path.extname(file);
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
    if (DEV) headers['Cache-Control'] = 'no-store';
    res.writeHead(200, headers);
    if (DEV && ext === '.html') return res.end(data.toString().replace('</body>', `${RELOAD_SNIPPET}\n</body>`));
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n  Duner Box${DEV ? ' (dev)' : ''} → http://localhost:${PORT}\n`);
  if (DEV) console.log('  Автоматично презареждане при промяна на файловете. Ctrl+C за спиране.\n');
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Порт ${PORT} е зает. Спри другия сървър или пусни с друг порт: PORT=3000 npm run dev`);
  else console.error(e);
  process.exit(1);
});
