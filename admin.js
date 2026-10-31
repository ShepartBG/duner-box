/* Duner Box — панел за поръчки (dunerbox.bg/admin) */
(() => {
  const D = window.DUNER;
  const $ = (s, el = document) => el.querySelector(s);
  const TZ = 'Europe/Sofia';
  const POLL_MS = 10000;
  const RING_MS = 8000;
  const TOKEN_KEY = 'db-admin-token';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* частен режим */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* частен режим */ } },
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;
  const dayOf = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const hm = (iso) => (iso ? new Intl.DateTimeFormat('bg-BG', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '');
  const minsSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  const shiftDay = (day, k) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + k);
    return d.toISOString().slice(0, 10);
  };

  let token = store.get(TOKEN_KEY);
  let day = dayOf(new Date());
  let followToday = true;    // „Днес“ — сменя се сам след полунощ
  let orders = [];
  let known = null;          // номерата от предишното зареждане (null = първо зареждане)
  let pollTimer = null;
  let ringTimer = null;
  let audio = null;          // AudioContext — създава се след натискане (изискване на браузъра)
  let soundOn = store.get('db-admin-sound') === '1';
  let wakeLock = null;
  const busy = new Set();    // поръчки, по които тече заявка
  const armed = new Map();   // двойно натискане за „Приемам“ / „Доставена“

  /* --- сървър --- */
  async function api(path, body) {
    const r = await fetch(`/api/admin/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const json = await r.json().catch(() => ({ ok: false, message: 'Грешка от сървъра.' }));
    if (r.status === 401 && path !== 'login') { logout(); throw new Error(json.message || 'Влез отново.'); }
    return { status: r.status, json };
  }

  /* --- вход / изход --- */
  function showLogin() {
    $('[data-app]').hidden = true;
    $('[data-login]').hidden = false;
    setTimeout(() => $('#pw').focus(), 50);
  }
  function showApp() {
    $('[data-login]').hidden = true;
    $('[data-app]').hidden = false;
    renderDay();
    load();
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
  }
  function logout() {
    token = null;
    store.del(TOKEN_KEY);
    clearInterval(pollTimer);
    stopRing();
    showLogin();
  }

  $('[data-login-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const err = $('[data-login-err]');
    err.textContent = '';
    btn.disabled = true;
    try {
      const { json } = await api('login', { password: $('#pw').value });
      if (!json.ok) { err.textContent = json.message || 'Грешка.'; return; }
      token = json.token;
      store.set(TOKEN_KEY, token);
      $('#pw').value = '';
      // натискането на „Влез“ позволява на браузъра да пуска звук
      enableSound();
      showApp();
    } catch {
      err.textContent = 'Няма връзка. Опитай пак.';
    } finally {
      btn.disabled = false;
    }
  });
  $('[data-logout]').addEventListener('click', () => { if (confirm('Изход от панела на това устройство?')) logout(); });

  /* --- ден --- */
  function renderDay() {
    const today = dayOf(new Date());
    const label = day === today ? 'Днес'
      : day === shiftDay(today, -1) ? 'Вчера'
        : new Intl.DateTimeFormat('bg-BG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
    $('[data-day-label]').textContent = label;
    $('[data-day-next]').disabled = day >= today;
  }
  function setDay(d) {
    day = d;
    followToday = d === dayOf(new Date());
    known = null;
    orders = [];
    render();
    renderDay();
    load();
  }
  $('[data-day-prev]').addEventListener('click', () => setDay(shiftDay(day, -1)));
  $('[data-day-next]').addEventListener('click', () => setDay(shiftDay(day, 1)));
  $('[data-day-today]').addEventListener('click', () => setDay(dayOf(new Date())));
  $('[data-refresh]').addEventListener('click', () => load());

  /* --- зареждане --- */
  let seq = 0; // само отговорът на последната заявка се показва (смяна на деня по време на зареждане)
  async function load() {
    if (!token) return;
    // след полунощ панелът минава сам на новия ден, ако е бил на „Днес“
    if (followToday && day !== dayOf(new Date())) { setDay(dayOf(new Date())); return; }
    const mine = ++seq;
    try {
      const { json } = await api(`orders?day=${day}`);
      if (mine !== seq) return;
      $('[data-offline]').hidden = true;
      if (!json.ok || json.day !== day) return;
      const fresh = json.orders.filter((o) => o.status === 'pending' && known && !known.has(o.id));
      orders = json.orders;
      known = new Set(orders.map((o) => o.id));
      render();
      if (fresh.length) {
        toast(fresh.length === 1 ? `🔥 Нова поръчка от ${fresh[0].name}` : `🔥 ${fresh.length} нови поръчки`);
        notify(fresh);
      }
      updateRing();
    } catch {
      if (mine === seq) $('[data-offline]').hidden = false;
    }
  }

  /* --- изглед --- */
  const STATUS = { pending: 'Чака', accepted: 'Приета', delivered: 'Доставена', declined: 'Отказана' };
  const ORDER_OF = { pending: 0, accepted: 1, delivered: 2, declined: 3 };

  function info(o) {
    if (o.status === 'pending') {
      const m = minsSince(o.createdAt);
      return `<p class="ord__info${m >= 5 ? ' is-late' : ''}">Чака отговор от ${m} мин.</p>`;
    }
    if (o.status === 'accepted') {
      const due = new Date(new Date(o.decidedAt).getTime() + D.ORDER.deliveryMinutes * 60000);
      const late = Date.now() > due.getTime();
      return `<p class="ord__info${late ? ' is-late' : ''}">Приета в ${hm(o.decidedAt)} · доставка до <b>${hm(due.toISOString())}</b>${late ? ' — закъснява!' : ''}</p>`;
    }
    if (o.status === 'delivered') return `<p class="ord__info">Приета в ${hm(o.decidedAt)} · доставена в ${hm(o.deliveredAt)}</p>`;
    return `<p class="ord__info">Отказана в ${hm(o.decidedAt)}${o.reason ? ` · ${esc(o.reason)}` : ''}</p>`;
  }

  function actions(o) {
    const dis = busy.has(o.id) ? ' disabled' : '';
    const arm = armed.get(o.id);
    if (o.status === 'pending') {
      return `<div class="ord__acts">
        <button class="btn btn--green" type="button" data-act="accept" data-id="${esc(o.id)}"${dis}>${arm === 'accept' ? 'Натисни пак ✓' : '✅ Приемам'}</button>
        <button class="btn btn--red" type="button" data-act="decline" data-id="${esc(o.id)}"${dis}>❌ Отказвам</button>
      </div>`;
    }
    if (o.status === 'accepted') {
      return `<div class="ord__acts"><button class="btn btn--blue" type="button" data-act="delivered" data-id="${esc(o.id)}"${dis}>${arm === 'delivered' ? 'Натисни пак ✓' : '🚚 Доставена'}</button></div>`;
    }
    return '';
  }

  function card(o) {
    const tel = String(o.phone || '').replace(/[^\d+]/g, '');
    const lines = (o.lines || []).map((l) => `<li>
        <span class="ord__qty">${l.qty}×</span>
        <span class="ord__item">${esc(l.name)}${l.sizeLabel ? ` <em>(${esc(l.sizeLabel)})</em>` : ''}${l.options ? `<small>${esc(l.options)}</small>` : ''}</span>
        <span class="ord__sum">${l.sum == null ? '—' : fmt(l.sum)}</span>
      </li>`).join('');
    return `<article class="ord ord--${o.status}" data-order="${esc(o.id)}">
      <div class="ord__head">
        <span class="ord__time">${hm(o.createdAt)}</span>
        <span class="ord__id">${esc(o.id)}</span>
        <span class="badge badge--${o.status}">${STATUS[o.status] || esc(o.status)}</span>
      </div>
      <div class="ord__body">
        <div class="ord__who">
          <span class="ord__name">${esc(o.name)}</span>
          <a class="ord__phone" href="tel:${esc(tel)}">📞 ${esc(o.phone)}</a>
        </div>
        ${o.address ? `<p class="ord__addr">📍 ${esc(o.address)}</p>` : ''}
        ${o.notes ? `<p class="ord__notes">${esc(o.notes)}</p>` : ''}
        <ul class="ord__lines">${lines}</ul>
        <div class="ord__total"><span>Общо${o.hasUnpriced ? '*' : ''}</span><span>${fmt(o.total)}</span></div>
        ${info(o)}
      </div>
      ${actions(o)}
    </article>`;
  }

  function render() {
    const sorted = [...orders].sort((a, b) => (ORDER_OF[a.status] - ORDER_OF[b.status]) || String(b.createdAt).localeCompare(String(a.createdAt)));
    $('[data-list]').innerHTML = sorted.map(card).join('');
    $('[data-empty]').hidden = orders.length > 0 || known === null;
    const count = (s) => orders.filter((o) => o.status === s).length;
    const sum = orders.filter((o) => o.status === 'accepted' || o.status === 'delivered').reduce((a, o) => a + o.total, 0);
    $('[data-stats]').innerHTML = [
      ['pending', 'Чакат', count('pending')], ['accepted', 'Приети', count('accepted')],
      ['delivered', 'Доставени', count('delivered')], ['declined', 'Отказани', count('declined')],
    ].map(([k, l, n]) => `<span class="stat stat--${k}">${l}<b>${n}</b></span>`).join('')
      + `<span class="stat stat--sum">Оборот<b>${fmt(sum)}</b></span>`;
    const pending = count('pending');
    document.title = pending ? `(${pending}) Нова поръчка — Duner Box` : 'Поръчки — Duner Box';
  }

  /* --- действия --- */
  function patch(o) {
    const i = orders.findIndex((x) => x.id === o.id);
    if (i >= 0) orders[i] = o; else orders.push(o);
    render();
    updateRing();
  }

  async function act(id, body, okText) {
    busy.add(id);
    render();
    try {
      const { json } = await api(body.status ? 'status' : 'decide', { id, ...body });
      busy.delete(id);
      if (json.order) patch(json.order); else render();
      if (json.ok) toast(okText + (json.emailSent === false ? ' ⚠ Имейлът до клиента не тръгна — обади се.' : ''));
      else toast(json.message || 'Грешка.');
    } catch (e) {
      busy.delete(id);
      render();
      toast(e.message || 'Няма връзка. Опитай пак.');
    }
  }

  // „Приемам“ и „Доставена“ искат второ натискане до 4 сек. — срещу случайно докосване
  function armOrRun(id, kind, run) {
    if (armed.get(id) === kind) {
      armed.delete(id);
      run();
      return;
    }
    armed.set(id, kind);
    render();
    setTimeout(() => { if (armed.get(id) === kind) { armed.delete(id); render(); } }, 4000);
  }

  $('[data-list]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    if (b.dataset.act === 'accept') armOrRun(id, 'accept', () => act(id, { action: 'accept' }, '✅ Приета — клиентът получи имейл.'));
    if (b.dataset.act === 'delivered') armOrRun(id, 'delivered', () => act(id, { status: 'delivered' }, '🚚 Отбелязана като доставена.'));
    if (b.dataset.act === 'decline') openDecline(id);
  });

  /* --- отказ с причина --- */
  const dlg = $('[data-decline-dlg]');
  let declineId = null;
  function openDecline(id) {
    declineId = id;
    $('[data-decline-id]').textContent = id;
    $('[data-decline-reason]').value = '';
    dlg.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-on'));
    dlg.showModal();
  }
  $('[data-chips]').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    dlg.querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-on', x === c));
    $('[data-decline-reason]').value = c.textContent;
  });
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'ok' && declineId) act(declineId, { action: 'decline', reason: $('[data-decline-reason]').value }, '❌ Отказана — клиентът получи имейл.');
    declineId = null;
  });

  /* --- звук, вибрация, известия --- */
  function beep() {
    if (!audio) return;
    const t0 = audio.currentTime;
    [0, 0.22, 0.44, 0.9, 1.12, 1.34].forEach((dt, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'square';
      o.frequency.value = i % 3 === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.2);
    });
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  }
  function stopRing() { clearInterval(ringTimer); ringTimer = null; }
  // звъни, докато има чакащи поръчки
  function updateRing() {
    const pending = orders.some((o) => o.status === 'pending') && day === dayOf(new Date());
    if (pending && soundOn && audio) {
      if (!ringTimer) { beep(); ringTimer = setInterval(beep, RING_MS); }
    } else {
      stopRing();
    }
  }

  function renderSound() {
    const live = soundOn && audio && audio.state === 'running';
    const b = $('[data-sound]');
    b.setAttribute('aria-pressed', String(!!live));
    b.innerHTML = `${live ? '🔔' : '🔕'} <span>Звук</span>`;
    $('[data-sound-banner]').hidden = !!live;
  }
  function enableSound() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
    } catch { audio = null; }
    soundOn = true;
    store.set('db-admin-sound', '1');
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    keepAwake();
    setTimeout(() => { renderSound(); updateRing(); }, 100);
  }
  $('[data-sound-on]').addEventListener('click', () => { enableSound(); beep(); });
  $('[data-sound]').addEventListener('click', () => {
    if (soundOn && audio && audio.state === 'running') {
      soundOn = false;
      store.set('db-admin-sound', '0');
      stopRing();
      renderSound();
    } else {
      enableSound();
      beep();
    }
  });

  async function notify(fresh) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    const body = fresh.map((o) => `${o.name} · ${fmt(o.total)}`).join('\n');
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration('/admin');
      if (reg) reg.showNotification('🔥 Нова поръчка — Duner Box', { body, tag: 'order', renotify: true, icon: '/assets/admin/icon-192.png' });
      else new Notification('🔥 Нова поръчка — Duner Box', { body });
    } catch { /* без известие */ }
  }

  // екранът да не изгасва, докато панелът е отворен (таблет на тезгяха)
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && !wakeLock && !document.hidden) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch { /* не се поддържа */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    load();
    if (soundOn) keepAwake();
  });

  /* --- прозорецът за поръчки (8:00–10:00) --- */
  function two(n) { return String(n).padStart(2, '0'); }
  const OPEN_AT = `${Math.floor(D.ORDER.start / 60)}:${two(D.ORDER.start % 60)}`;
  function hms(s) { return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`; }
  function tick() {
    const w = D.orderWindow(new Date());
    const el = $('[data-win]');
    el.classList.toggle('is-open', w.open);
    $('[data-win-text]').textContent = w.open
      ? `Поръчките са отворени · още ${hms(w.secondsLeft)}`
      : w.secondsToOpen == null ? 'Поръчките са затворени'
        : w.secondsToOpen < 86400 ? `Отварят след ${hms(w.secondsToOpen)}` : `Затворено · отваря в ${D.DAY_NAMES[w.nextDay]} в ${OPEN_AT}`;
    // „Чака от X мин.“ и „закъснява“ се обновяват всяка минута
    if (new Date().getSeconds() === 0) render();
  }
  setInterval(tick, 1000);
  tick();

  /* --- приложение на началния екран --- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' }).catch(() => {});

  let toastTimer;
  function toast(text) {
    const t = $('[data-toast]');
    t.textContent = text;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 4000);
  }

  renderSound();
  if (token) showApp(); else showLogin();
})();
