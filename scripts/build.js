// Копира само публичните файлове на сайта в dist/ (за Cloudflare). Без сървърен код, тестове и снимки-оригинали.
// Добавя ?v=<отпечатък> към адресите на файловете в assets/: снимките се кешират 7 дни (_headers),
// а при нова снимка адресът се сменя и браузърът я изтегля веднага.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const PUBLIC = ['index.html', 'styles.css', 'script.js', 'menu-data.js', 'assets', 'robots.txt', 'sitemap.xml', '_headers', 'privacy.html',
  'admin.html', 'admin.css', 'admin.js', 'admin.webmanifest', 'admin-sw.js'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
for (const p of PUBLIC) fs.cpSync(path.join(ROOT, p), path.join(OUT, p), { recursive: true });

// отпечатък на всеки файл в assets/
const hashes = {};
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) walk(full);
    else hashes[path.relative(OUT, full).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex').slice(0, 10);
  }
})(path.join(OUT, 'assets'));

const edit = (file, fn) => {
  const p = path.join(OUT, file);
  fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')));
};

// статичните адреси в HTML/CSS/манифеста
for (const file of ['index.html', 'privacy.html', 'admin.html', 'styles.css', 'admin.css', 'admin.webmanifest', 'admin.js']) {
  edit(file, (s) => s.replace(/assets\/[A-Za-z0-9_./-]+\.(?:webp|jpe?g|png|svg)(?!\?v=)/g, (m) => (hashes[m] ? `${m}?v=${hashes[m]}` : m)));
}

// снимките, които script.js сглобява сам: IMG('items/duner-small') → assets/img/items/duner-small.webp
const imgV = {};
for (const [k, h] of Object.entries(hashes)) {
  const m = /^assets\/img\/(.+)\.webp$/.exec(k);
  if (m) imgV[m[1]] = h;
}
edit('script.js', (s) => {
  if (!s.includes('const IMG_V = {};')) throw new Error('script.js: липсва const IMG_V = {};');
  return s.replace('const IMG_V = {};', `const IMG_V = ${JSON.stringify(imgV)};`);
});

// версия на панела: отвореният панел я проверява и предлага „Обнови“
const build = crypto.createHash('sha256');
for (const f of ['admin.html', 'admin.css', 'admin.js', 'menu-data.js']) build.update(fs.readFileSync(path.join(OUT, f)));
const buildId = build.digest('hex').slice(0, 12);
edit('admin.js', (s) => {
  if (!s.includes("const BUILD = 'dev';")) throw new Error("admin.js: липсва const BUILD = 'dev';");
  return s.replace("const BUILD = 'dev';", `const BUILD = '${buildId}';`);
});
fs.writeFileSync(path.join(OUT, 'admin-version.txt'), buildId);

console.log('dist/ готов:', PUBLIC.join(', '), `· версии на ${Object.keys(hashes).length} файла`);
