/* ===== Duner Box — script ===== */

/*
 * --- Меню: редактирай цените и позициите тук ---
 * Цените (bgn) са в лева, както са на менюто в обекта.
 * На сайта се показват в евро (по фиксирания курс), а в лева като второстепенна стойност.
 */
const BGN_PER_EUR = 1.95583;

const CATEGORIES = [
  { id: 'duner', label: 'Дюнери', ill: 'wrap',
    note: 'Дюнер месо от шиша, пресни зеленчуци и чеснов сос. Избери си размера.' },
  { id: 'box', label: 'Duner Box', ill: 'box',
    note: 'Дюнер месо и пържени картофи в кутия.' },
  { id: 'sandwich', label: 'Грил сандвичи', ill: 'sandwich', wide: true,
    sub: 'малък 330 гр. · голям 480 гр.', sizes: ['малък', 'голям'] },
  { id: 'pocket', label: 'Джоб (Burger)', ill: 'pocket',
    sub: '600 гр. · меча лапа' },
  { id: 'salad', label: 'Салати', ill: 'salad' },
  { id: 'sides', label: 'Гарнитури', ill: 'fries' },
];

const MENU = [
  // Дюнери
  { id: 'duner-small', cat: 'duner', name: 'Дюнер малък', prices: [5.0] },
  { id: 'duner-medium', cat: 'duner', name: 'Дюнер среден', prices: [6.0] },
  { id: 'duner-large', cat: 'duner', name: 'Дюнер голям', prices: [7.0] },
  { id: 'duner-royal', cat: 'duner', name: 'Дюнер кралски', tag: 'Хит', prices: [10.0],
    desc: 'Най-големият ни дюнер, за истински гладните.',
    hit: 1, badge: 'Кралски размер' },
  { id: 'extra-meat', cat: 'duner', name: 'Допълнително месо', desc: '100 гр. дюнер месо', prices: [4.0] },

  // Duner Box
  { id: 'box-small', cat: 'box', name: 'Duner Box малък', desc: 'Дюнер месо и пържени картофи в кутия.', prices: [6.0] },
  { id: 'box-large', cat: 'box', name: 'Duner Box голям', tag: 'Подпис', desc: 'Дюнер месо и пържени картофи в кутия, по-голяма порция.', prices: [7.0],
    hit: 2, badge: 'Нашият подпис' },

  // Грил сандвичи (малък 330 гр. / голям 480 гр.)
  { id: 'sand-ham', cat: 'sandwich', name: 'Шунка и кашкавал', prices: [5.5, 6.5],
    desc: 'Шунка, кашкавал, маруля, чеснов сос, зеле, пържени картофи, краставица, домат.' },
  { id: 'sand-royal', cat: 'sandwich', name: 'Роял', prices: [6.0, 7.0],
    desc: 'Шунка, кашкавал, луканка, бекон, маруля, зеле, домат, чеснов сос, краставица, лук.' },
  { id: 'sand-tarikatski', cat: 'sandwich', name: 'Тарикатски', tag: 'Хит', prices: [6.5, 8.5],
    desc: 'Телешко кюфте, бекон, маруля, зеле, краставица, домат, пържени картофи, чеснов сос.',
    hit: 3, badge: 'Грил хит' },
  { id: 'sand-pacific', cat: 'sandwich', name: 'Пасифик', prices: [6.5, 7.5],
    desc: 'Риба тон, маруля, домат, краставица, зеле, чеснов сос, пармезан, лук.' },
  { id: 'sand-4x4', cat: 'sandwich', name: '4x4 Маджо', prices: [6.0, 7.0],
    desc: 'Кашкавал, моцарела, пушено сирене, пармезан, маруля, чеснов сос, домат, краставица, зеле, лук.' },
  { id: 'sand-donvito', cat: 'sandwich', name: 'Дон Вито', prices: [6.5, 7.5],
    desc: 'Дюнер месо, пушено сирене, маруля, зеле, домат, краставица, чеснов сос, лук.' },

  // Джоб (Burger) — 600 гр., меча лапа
  { id: 'pocket-veg', cat: 'pocket', name: 'Зеленчуков', prices: [4.0] },
  { id: 'pocket-ham', cat: 'pocket', name: 'Шунка', prices: [5.5] },
  { id: 'pocket-bacon', cat: 'pocket', name: 'Бекон', prices: [5.5] },
  { id: 'pocket-combo', cat: 'pocket', name: 'Комбиниран', prices: [6.0] },
  { id: 'pocket-smoked', cat: 'pocket', name: 'Пушено сирене', prices: [5.0] },
  { id: 'pocket-cheese', cat: 'pocket', name: 'Кашкавал', prices: [5.0] },
  { id: 'pocket-lukanka', cat: 'pocket', name: 'Луканка', prices: [5.5] },
  { id: 'pocket-doner', cat: 'pocket', name: 'Дюнер месо', prices: [7.0] },
  { id: 'pocket-tuna', cat: 'pocket', name: 'Риба тон', prices: [6.0] },

  // Салати
  { id: 'salad-doner', cat: 'salad', name: 'Дюнер салата', sizeLabel: '750 мл', prices: [6.0],
    desc: 'Дюнер месо, домат, краставица, зеле, маруля, лук и чеснов сос. Контейнер 750 мл.' },
  { id: 'salad-doner-large', cat: 'salad', name: 'Дюнер салата голяма', sizeLabel: '1000 мл', prices: [7.0],
    desc: 'Дюнер месо, домати, краставици, зеле, маруля, лук и чеснов сос. Контейнер 1000 мл.' },
  { id: 'salad-tuna', cat: 'salad', name: 'Зелена салата с риба тон', sizeLabel: '400 гр.', prices: [6.5],
    desc: 'Зелена салата, риба тон, краставица, чеснов сос.' },

  // Гарнитури
  { id: 'fries', cat: 'sides', name: 'Пържени картофи', desc: '100 гр.', prices: [2.5] },
];

/* Работно време: 0 = неделя ... 6 = събота; [отваря, затваря] в минути */
const HOURS = {
  0: null,
  1: [510, 1140], 2: [510, 1140], 3: [510, 1140], 4: [510, 1140], 5: [510, 1140],
  6: [600, 1080],
};

const num = (n) => n.toFixed(2).replace('.', ',');
const eur = (bgn) => `${num(Math.round((bgn / BGN_PER_EUR) * 100) / 100)} €`;
const lev = (bgn) => `${num(bgn)} лв`;
const fmtTime = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const ill = (name) => `<svg aria-hidden="true"><use href="#ill-${name}"/></svg>`;
const catOf = (id) => CATEGORIES.find((c) => c.id === id);
const DAY_NAMES = ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'];

/* --- Хитове --- */
function renderHits() {
  const host = document.querySelector('[data-hits]');
  if (!host) return;
  const hits = MENU.filter((m) => m.hit).sort((a, b) => a.hit - b.hit);
  host.innerHTML = hits.map((m, i) => {
    const cat = catOf(m.cat);
    const multi = m.prices.length > 1;
    return `
    <article class="card hit reveal" data-hit="${m.id}">
      <div class="hit__media">
        <span class="hit__num">${String(i + 1).padStart(2, '0')}</span>
        ${m.badge ? `<span class="hit__badge">${m.badge}</span>` : ''}
        ${ill(cat.ill)}
      </div>
      <div class="hit__body">
        <h3>${m.name}</h3>
        <p>${m.desc || cat.note || ''}</p>
        <div class="hit__foot">
          <span class="price"><span class="silver">${multi ? 'от ' : ''}${eur(m.prices[0])}</span><small>${lev(m.prices[0])}</small></span>
          <a class="link-arrow" href="#menu" data-filter-link="${m.cat}">В менюто <svg class="ico"><use href="#i-arrow"/></svg></a>
        </div>
      </div>
    </article>`;
  }).join('');
}

/* --- Промо цени за Duner Box --- */
function renderPromo() {
  const host = document.querySelector('[data-promo-prices]');
  if (!host) return;
  host.innerHTML = MENU.filter((m) => m.cat === 'box').map((m) => `
    <div class="pp">
      <span class="pp__l">${m.name.replace('Duner Box ', '')}</span>
      <span class="pp__p silver">${eur(m.prices[0])}</span>
      <span class="pp__bgn">${lev(m.prices[0])}</span>
    </div>`).join('');
}

/* --- Меню: табла по категории + табове --- */
function renderMenu() {
  const tabs = document.querySelector('[data-tabs]');
  const host = document.querySelector('[data-menu]');
  if (!tabs || !host) return;

  const all = [{ id: 'all', label: 'Всичко' }, ...CATEGORIES];
  tabs.innerHTML = all.map((c, i) => `
    <button class="tab" type="button" role="tab" id="tab-${c.id}" data-cat="${c.id}"
      aria-selected="${i === 0}" aria-controls="menu-panel">${c.label}</button>`).join('');

  host.id = 'menu-panel';
  host.setAttribute('role', 'tabpanel');
  host.innerHTML = CATEGORIES.map((c) => {
    const items = MENU.filter((m) => m.cat === c.id);
    return `
    <section class="card board${c.wide ? ' board--wide' : ''}" data-board="${c.id}" aria-label="${c.label}">
      <div class="board__head">
        <h3 class="gold">${c.label}</h3>
        ${c.sub ? `<span class="board__sub">${c.sub}</span>` : ''}
      </div>
      ${c.note && c.id !== 'box' ? `<p class="board__note">${c.note}</p>` : ''}
      <div class="board__grid">
        ${items.map((m) => row(m, c)).join('')}
      </div>
    </section>`;
  }).join('');

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (btn) setCategory(btn.dataset.cat);
  });
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const list = [...tabs.querySelectorAll('.tab')];
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    const next = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
    next.focus();
    setCategory(next.dataset.cat);
  });
}

function row(m, c) {
  const multi = m.prices.length > 1;
  return `
    <div class="row${multi ? ' row--multi' : ''}" data-item="${m.id}" data-cat="${m.cat}">
      <div class="row__ill">${ill(c.ill)}</div>
      <div class="row__name">
        <h4>${m.name}${m.tag ? `<span class="row__tag">${m.tag}</span>` : ''}</h4>
        ${m.desc ? `<p>${m.desc}</p>` : ''}
      </div>
      <div class="row__prices">
        ${m.prices.map((p, i) => `
          <span class="pr">${multi ? `<i>${c.sizes[i]}</i>` : ''}<b>${eur(p)}</b><small>${lev(p)}</small></span>`).join('')}
      </div>
    </div>`;
}

function setCategory(cat) {
  document.querySelectorAll('[data-tabs] .tab').forEach((t) => {
    const on = t.dataset.cat === cat;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll('[data-board]').forEach((b) => {
    b.hidden = !(cat === 'all' || b.dataset.board === cat);
  });
  const panel = document.getElementById('menu-panel');
  if (panel) {
    panel.classList.toggle('is-filtered', cat !== 'all');
    panel.setAttribute('aria-labelledby', `tab-${cat}`);
  }
}

/* Линкове, които отварят конкретна категория в менюто */
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-filter-link]');
  if (a) setCategory(a.dataset.filterLink);
});

/* --- Мобилна навигация --- */
function initNav() {
  const burger = document.querySelector('.burger');
  const nav = document.getElementById('nav');
  if (!burger || !nav) return;
  const set = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Затвори менюто' : 'Отвори менюто');
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
  };
  burger.addEventListener('click', () => set(burger.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('is-open') && !nav.contains(e.target) && !burger.contains(e.target)) set(false);
  });
  matchMedia('(min-width: 921px)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

/* --- Отворено ли е сега (по софийско време) --- */
function sofiaNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

function nextOpening(day, min) {
  for (let k = 0; k < 8; k++) {
    const d = (day + k) % 7;
    const h = HOURS[d];
    if (h && (k > 0 || min < h[0])) {
      const when = k === 0 ? 'днес' : k === 1 ? 'утре' : `в ${DAY_NAMES[d]}`;
      return `${when} в ${fmtTime(h[0])}`;
    }
  }
  return '';
}

function initStatus() {
  const { day, min } = sofiaNow();
  const h = HOURS[day];
  const open = !!h && min >= h[0] && min < h[1];
  const el = document.querySelector('[data-status]');
  const txt = document.querySelector('[data-status-text]');
  if (el && txt) {
    el.classList.add(open ? 'is-open' : 'is-closed');
    txt.textContent = open
      ? `Отворено сега · до ${fmtTime(h[1])}`
      : `Затворено · отваряме ${nextOpening(day, min)}`;
  }
  const r = document.querySelector(`[data-hours] tr[data-day="${day}"]`);
  if (r) r.classList.add('is-today');
}

/* --- Пламъци --- */
function initFlames() {
  document.querySelectorAll('[data-flames]').forEach((host) => {
    const count = Math.max(12, Math.min(28, Math.round(host.offsetWidth / 55)));
    let html = '';
    for (let i = 0; i < count; i++) {
      const w = 60 + Math.random() * 90;
      const h = 90 + Math.random() * 130;
      const left = (i / count) * 100 + (Math.random() * 4 - 2);
      html += `<span class="flame" style="left:calc(${left}% - ${w / 2}px);width:${w}px;height:${h}px;--d:${(1.1 + Math.random() * 1.2).toFixed(2)}s;--delay:-${(Math.random() * 2).toFixed(2)}s"></span>`;
    }
    host.innerHTML = html;
  });
}

/* --- Искри (canvas) --- */
function initEmbers() {
  const canvas = document.querySelector('[data-embers]');
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, running = true, parts = [];

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.offsetWidth; h = canvas.offsetHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const spawn = (initial) => ({
    x: Math.random() * w,
    y: initial ? Math.random() * h : h + 10,
    r: 0.8 + Math.random() * 2.2,
    vy: 0.4 + Math.random() * 1.3,
    vx: (Math.random() - 0.5) * 0.4,
    life: 0,
    max: 200 + Math.random() * 260,
    hue: 20 + Math.random() * 25,
  });
  resize();
  const n = Math.round(Math.min(70, w / 18));
  parts = Array.from({ length: n }, () => spawn(true));

  const tick = () => {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      p.life++;
      p.y -= p.vy;
      p.x += p.vx + Math.sin((p.life + p.max) / 30) * 0.35;
      const t = p.life / p.max;
      const a = Math.max(0, Math.min(1, t * 4) * (1 - t));
      ctx.fillStyle = `hsla(${p.hue}, 100%, 55%, ${a * 0.25})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsla(${p.hue + 15}, 100%, 70%, ${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      if (p.life > p.max || p.y < -10) Object.assign(p, spawn(false));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.addEventListener('resize', resize);
  new IntersectionObserver(([en]) => {
    const was = running;
    running = en.isIntersecting;
    if (running && !was) requestAnimationFrame(tick);
  }).observe(canvas);
}

/* --- Активен линк в навигацията --- */
function initScrollSpy() {
  const links = [...document.querySelectorAll('.nav a[href^="#"]')];
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((l) => l.classList.remove('is-active'));
      const a = map.get(en.target.id);
      if (a) a.classList.add('is-active');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['hits', 'menu', 'about', 'visit'].forEach((id) => {
    const s = document.getElementById(id);
    if (s) io.observe(s);
  });
}

/* --- Плавно появяване --- */
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

/* --- Старт --- */
renderHits();
renderPromo();
renderMenu();
setCategory('all');
initNav();
initStatus();
initFlames();
initEmbers();
initScrollSpy();
initReveal();
const royal = MENU.find((m) => m.id === 'duner-royal');
const sticker = document.querySelector('[data-sticker] b');
if (royal && sticker) sticker.textContent = eur(royal.prices[0]);
const yr = document.querySelector('[data-year]');
if (yr) yr.textContent = new Date().getFullYear();
