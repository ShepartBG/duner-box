// Копира само публичните файлове на сайта в dist/ (за Cloudflare). Без сървърен код, тестове и снимки-оригинали.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const PUBLIC = ['index.html', 'styles.css', 'script.js', 'menu-data.js', 'assets', 'robots.txt', 'sitemap.xml', '_headers'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
for (const p of PUBLIC) fs.cpSync(path.join(ROOT, p), path.join(OUT, p), { recursive: true });
console.log('dist/ готов:', PUBLIC.join(', '));
