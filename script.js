/* ===== Duner Box — script =====
 * Менюто, цените и правилата за поръчка са в menu-data.js (window.DUNER).
 */
const { CATEGORIES, MENU, HOURS, ORDER, DAY_NAMES, INGREDIENTS, SAUCES, sofiaNow, orderWindow, round2, sizeLabels, normalizeOptions, optionsSummary } = window.DUNER;

const IMG = (name) => `assets/img/${name}.webp`;
const eur = (n) => `${n.toFixed(2).replace('.', ',')} €`;
const fmtTime = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const catOf = (id) => CATEGORIES.find((c) => c.id === id);
const itemOf = (id) => MENU.find((m) => m.id === id);
const thumbOf = (m) => `items/${m.id}`;
const priceHtml = (p) => (p == null ? '<span class="soon">цена скоро</span>' : eur(p));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* без localStorage */ } },
};

/* ---------- Най-добрите на квартала ---------- */
function renderHits() {
  const host = $('[data-hits]');
  if (!host) return;
  const hits = MENU.filter((m) => m.hit).sort((a, b) => a.hit - b.hit);
  host.innerHTML = hits.map((m, i) => {
    const multi = m.prices.length > 1;
    const cat = catOf(m.cat);
    return `
    <article class="card hit reveal" data-hit="${m.id}">
      <div class="hit__media${m.photo === 'box' ? ' hit__media--cutout' : ''}">
        <img src="${IMG(m.photo)}" alt="${m.name}" loading="lazy">
        <span class="hit__num">${String(i + 1).padStart(2, '0')}</span>
        ${m.badge ? `<span class="hit__badge">${m.badge}</span>` : ''}
      </div>
      <div class="hit__body">
        <h3>${m.name}</h3>
        <p>${m.desc || cat.note || ''}</p>
        <div class="hit__foot">
          <span class="price silver">${multi ? 'от ' : ''}${eur(m.prices[0])}</span>
          <button class="btn btn--fire btn--sm" type="button" data-add="${m.id}" data-size="0">${hasOptions(m) ? '+ Избери' : '+ Добави'}</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

/* ---------- Промо цени за Duner Box ---------- */
function renderPromo() {
  const host = $('[data-promo-prices]');
  if (!host) return;
  host.innerHTML = MENU.filter((m) => m.cat === 'box').map((m) => `
    <div class="pp">
      <span class="pp__l">${m.name.replace('Duner Box ', '')}</span>
      <span class="pp__p silver">${eur(m.prices[0])}</span>
    </div>`).join('');
}

/* ---------- Меню: табла по категории + табове ---------- */
function renderMenu() {
  const tabs = $('[data-tabs]');
  const host = $('[data-menu]');
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
    <section class="card board${c.wide ? ' board--wide' : ''}${c.compact ? ' board--compact' : ''}" data-board="${c.id}" aria-label="${c.label}">
      <div class="board__head">
        <h3 class="gold">${c.label}</h3>
        ${c.sub ? `<span class="board__sub">${c.sub}</span>` : ''}
      </div>
      ${c.note && c.id !== 'box' ? `<p class="board__note">${c.note}</p>` : ''}
      <div class="board__grid">${items.map((m) => row(m, c)).join('')}</div>
    </section>`;
  }).join('');

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (btn) setCategory(btn.dataset.cat);
  });
  tabs.addEventListener('keydown', (e) => arrowNav(e, tabs, '.tab', (b) => setCategory(b.dataset.cat)));
}

function row(m, c) {
  const multi = m.prices.length > 1;
  return `
    <div class="row${multi ? ' row--multi' : ''}" data-item="${m.id}" data-cat="${m.cat}">
      <img class="row__img${m.cutout ? ' is-cutout' : ''}" src="${IMG(thumbOf(m))}" alt="" loading="lazy" width="56" height="56">
      <div class="row__name">
        <h4>${m.name}${m.tag ? `<span class="row__tag">${m.tag}</span>` : ''}</h4>
        ${m.desc ? `<p>${m.desc}</p>` : ''}
        ${m.flavors ? `<p class="row__flavors">${m.flavors.join(' · ')}</p>` : ''}
      </div>
      <div class="row__prices">
        ${m.prices.map((p, i) => `<span class="pr">${multi ? `<i>${sizeLabels(m)[i]}</i>` : ''}<b>${priceHtml(p)}</b></span>`).join('')}
      </div>
    </div>`;
}

function arrowNav(e, host, sel, activate) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const list = $$(sel, host);
  const i = list.indexOf(document.activeElement);
  if (i < 0) return;
  const next = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
  next.focus();
  activate(next);
}

function setCategory(cat) {
  $$('[data-tabs] .tab').forEach((t) => {
    const on = t.dataset.cat === cat;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $$('[data-board]').forEach((b) => { b.hidden = !(cat === 'all' || b.dataset.board === cat); });
  const panel = $('#menu-panel');
  if (panel) {
    panel.classList.toggle('is-filtered', cat !== 'all');
    panel.setAttribute('aria-labelledby', `tab-${cat}`);
  }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-filter-link]');
  if (a) setCategory(a.dataset.filterLink);
  const s = e.target.closest('[data-shop-link]');
  if (s) setShopCategory(s.dataset.shopLink);
});

/* ======================================================================
 * Поръчки за вкъщи
 * ==================================================================== */
const cart = { lines: store.get('db-cart', []) }; // [{id, size, flavor?, opts?, qty}]
const hasOptions = (m) => (catOf(m.cat).options || []).length > 0;
let windowState = orderWindow();
let sending = false;

function renderShop() {
  const tabs = $('[data-shop-tabs]');
  const grid = $('[data-shop]');
  if (!tabs || !grid) return;
  const shopCats = CATEGORIES.filter((c) => c.shop !== false);
  tabs.innerHTML = shopCats.map((c, i) => `
    <button class="chip" type="button" role="tab" id="shop-tab-${c.id}" data-shop-cat="${c.id}" aria-selected="${i === 0}">${c.label}</button>`).join('');
  grid.innerHTML = MENU.filter((m) => catOf(m.cat).shop !== false).map((m) => {
    const multi = m.prices.length > 1;
    return `
    <article class="product" data-product="${m.id}" data-cat="${m.cat}">
      <img class="product__img${m.cutout ? ' is-cutout' : ''}" src="${IMG(thumbOf(m))}" alt="" loading="lazy" width="320" height="320">
      <div class="product__body">
        <h4>${m.name}</h4>
        ${m.desc ? `<p>${m.desc}</p>` : ''}
        ${multi ? `<div class="sizes" role="radiogroup" aria-label="Размер за ${m.name}">
          ${m.prices.map((p, i) => `<button type="button" class="size" role="radio" aria-checked="${i === 0}" data-size-pick="${i}">${sizeLabels(m)[i]} · ${eur(p)}</button>`).join('')}
        </div>` : ''}
        ${m.flavors ? `<label class="flavor"><span>Вкус</span><select data-flavor aria-label="Вкус за ${m.name}">
          ${m.flavors.map((f) => `<option value="${f}">${f}</option>`).join('')}
        </select></label>` : ''}
        <div class="product__foot">
          <span class="product__price" data-product-price>${priceHtml(m.prices[0])}</span>
          <button class="btn btn--fire btn--sm" type="button" data-add="${m.id}" data-size="0" aria-label="Добави ${m.name}">${hasOptions(m) ? '+ Избери' : '+ Добави'}</button>
        </div>
      </div>
    </article>`;
  }).join('');

  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-shop-cat]');
    if (b) setShopCategory(b.dataset.shopCat);
  });
  tabs.addEventListener('keydown', (e) => arrowNav(e, tabs, '.chip', (b) => setShopCategory(b.dataset.shopCat)));
  grid.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-size-pick]');
    if (!pick) return;
    const card = pick.closest('[data-product]');
    const m = itemOf(card.dataset.product);
    const i = Number(pick.dataset.sizePick);
    $$('[data-size-pick]', card).forEach((b) => b.setAttribute('aria-checked', String(b === pick)));
    $('[data-add]', card).dataset.size = String(i);
    $('[data-product-price]', card).innerHTML = priceHtml(m.prices[i]);
  });
  setShopCategory('duner');
}

function setShopCategory(cat) {
  $$('[data-shop-cat]').forEach((b) => {
    const on = b.dataset.shopCat === cat;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  $$('[data-product]').forEach((p) => { p.hidden = p.dataset.cat !== cat; });
}

/* --- количка --- */
function lineLabel(l) {
  const m = itemOf(l.id);
  const extra = [m.prices.length > 1 ? sizeLabels(m)[l.size] : '', l.flavor || ''].filter(Boolean).join(', ');
  return extra ? `${m.name} (${extra})` : m.name;
}
function linePrice(l) {
  const m = itemOf(l.id);
  const base = m.prices[l.size];
  if (base == null) return null;
  const o = normalizeOptions(m, l.opts);
  return round2(base + (o ? o.extraPrice : 0));
}
const optsKey = (o) => JSON.stringify(o || null);

function addToCart(id, size, flavor, fromEl, opts, qty = 1) {
  const m = itemOf(id);
  if (!m) return;
  if (m.flavors && !m.flavors.includes(flavor)) flavor = m.flavors[0];
  if (!m.flavors) flavor = undefined;
  const o = hasOptions(m) ? normalizeOptions(m, opts) : null;
  const clean = o ? { ingredients: o.ingredients, sauces: o.sauces, extras: o.extras } : undefined;
  const ex = cart.lines.find((l) => l.id === id && l.size === size && l.flavor === flavor && optsKey(l.opts) === optsKey(clean));
  if (ex) ex.qty = Math.min(ORDER.maxQty, ex.qty + qty);
  else {
    const line = { id, size, qty: Math.min(ORDER.maxQty, qty) };
    if (flavor) line.flavor = flavor;
    if (clean) line.opts = clean;
    cart.lines.push(line);
  }
  saveCart();
  renderCart();
  toast(`🔥 ${lineLabel({ id, size, flavor })} е в количката`);
  if (fromEl) sparkBurst(fromEl);
  const fab = $('[data-fab]');
  if (fab) { fab.classList.remove('bump'); void fab.offsetWidth; fab.classList.add('bump'); }
}

function saveCart() {
  cart.lines = cart.lines.filter((l) => {
    const m = itemOf(l.id);
    return m && l.qty > 0 && l.size < m.prices.length && (!m.flavors || m.flavors.includes(l.flavor))
      && (!hasOptions(m) ? !l.opts : !!normalizeOptions(m, l.opts));
  });
  store.set('db-cart', cart.lines);
}

function cartTotals() {
  let total = 0, count = 0, unpriced = false;
  for (const l of cart.lines) {
    const p = linePrice(l);
    count += l.qty;
    if (p == null) unpriced = true; else total += p * l.qty;
  }
  return { total: round2(total), count, unpriced };
}

function renderCart() {
  const list = $('[data-cart-list]');
  if (!list) return;
  const { total, count, unpriced } = cartTotals();
  list.innerHTML = cart.lines.map((l, i) => {
    const p = linePrice(l);
    return `
    <li class="cart__line" data-line="${i}">
      <div class="cart__name">${lineLabel(l)}${l.opts ? `<span class="cart__opts">${optionsSummary(itemOf(l.id), l.opts)}</span>` : ''}<small>${p == null ? 'цена при доставка' : `${eur(p)} / бр.`}</small></div>
      <div class="qty">
        <button type="button" data-qty="-1" aria-label="Едно по-малко ${lineLabel(l)}">−</button>
        <span data-qty-val>${l.qty}</span>
        <button type="button" data-qty="1" aria-label="Още едно ${lineLabel(l)}">+</button>
      </div>
      <b class="cart__sum">${p == null ? '—' : eur(p * l.qty)}</b>
    </li>`;
  }).join('');
  const empty = cart.lines.length === 0;
  $('[data-cart-empty]').hidden = !empty;
  $('[data-cart-total-row]').hidden = empty;
  $('[data-cart-clear]').hidden = empty;
  $('[data-cart-unpriced]').hidden = !unpriced;
  $('[data-cart-total]').textContent = eur(total);
  $('[data-submit-total]').textContent = empty ? '' : `· ${eur(total)}`;
  const fab = $('[data-fab]');
  fab.hidden = empty;
  $('[data-fab-count]').textContent = count;
  $('[data-fab-total]').textContent = eur(total);
  updateSubmit();
}

function initCart() {
  saveCart();
  $('[data-cart-list]')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qty]');
    if (!b) return;
    const i = Number(b.closest('[data-line]').dataset.line);
    const l = cart.lines[i];
    l.qty = Math.max(0, Math.min(ORDER.maxQty, l.qty + Number(b.dataset.qty)));
    saveCart();
    renderCart();
  });
  $('[data-cart-clear]')?.addEventListener('click', () => { cart.lines = []; saveCart(); renderCart(); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const m = itemOf(b.dataset.add);
    if (m && hasOptions(m)) { openBuilder(m, Number(b.dataset.size || 0)); return; }
    const sel = b.closest('[data-product]')?.querySelector('[data-flavor]');
    addToCart(b.dataset.add, Number(b.dataset.size || 0), sel ? sel.value : undefined, b);
  });
  renderCart();
}

/* --- „Направи си го“: избор на съставки, сосове и добавки --- */
const builder = { item: null, size: 0, qty: 1 };
const EXTRAS = MENU.filter((m) => m.cat === 'extras');

function chips(name, list, label = (x) => x) {
  return list.map((v) => `
    <label class="opt"><input type="checkbox" name="${name}" value="${v}"><span>${label(v)}</span></label>`).join('');
}

function openBuilder(m, size = 0) {
  const dlg = $('[data-builder]');
  const allowed = catOf(m.cat).options || [];
  builder.item = m; builder.size = size; builder.qty = 1;
  const multi = m.prices.length > 1;
  dlg.querySelector('[data-b-body]').innerHTML = `
    <div class="bld__head">
      <img src="${IMG(thumbOf(m))}" alt="" class="bld__img${m.cutout ? ' is-cutout' : ''}">
      <div><h3 id="bld-title">${m.name}</h3>${m.desc ? `<p>${m.desc}</p>` : ''}</div>
    </div>
    ${multi ? `<div class="bld__sec"><h4>Размер</h4><div class="sizes" role="radiogroup" aria-label="Размер">
      ${m.prices.map((p, i) => `<button type="button" class="size" role="radio" aria-checked="${i === size}" data-b-size="${i}">${sizeLabels(m)[i]} · ${eur(p)}</button>`).join('')}
    </div></div>` : ''}
    ${allowed.includes('ingredients') ? `<div class="bld__sec" data-b-group="ingredients">
      <div class="bld__row"><h4>Със какво да е?</h4><button type="button" class="opt-all" data-b-all aria-pressed="false">✓ Със всичко</button></div>
      <div class="opts">${chips('ingredients', INGREDIENTS)}</div>
    </div>` : ''}
    ${allowed.includes('sauces') ? `<div class="bld__sec" data-b-group="sauces">
      <h4>Сосове и подправки <small>безплатно</small></h4>
      <div class="opts">${chips('sauces', SAUCES)}</div>
    </div>` : ''}
    ${allowed.includes('extras') ? `<div class="bld__sec" data-b-group="extras">
      <h4>Добавки</h4>
      <div class="opts">${chips('extras', EXTRAS.map((x) => x.id), (id) => { const x = itemOf(id); return `${x.name} <em>+${eur(x.prices[0])}</em>`; })}</div>
    </div>` : ''}`;
  updateBuilder();
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  document.body.classList.add('bld-open');
}

function builderOpts() {
  const dlg = $('[data-builder]');
  const vals = (n) => $$(`input[name="${n}"]:checked`, dlg).map((i) => i.value);
  return { ingredients: vals('ingredients'), sauces: vals('sauces'), extras: vals('extras') };
}

function updateBuilder() {
  const dlg = $('[data-builder]');
  const m = builder.item;
  const o = normalizeOptions(m, builderOpts());
  const unit = round2(m.prices[builder.size] + (o ? o.extraPrice : 0));
  $('[data-b-qty]', dlg).textContent = builder.qty;
  $('[data-b-total]', dlg).textContent = eur(unit * builder.qty);
  const all = $$('input[name="ingredients"]', dlg);
  const btn = $('[data-b-all]', dlg);
  if (btn) {
    const full = all.length && all.every((i) => i.checked);
    btn.setAttribute('aria-pressed', String(full));
    btn.textContent = full ? '✕ Махни всички' : '✓ Със всичко';
  }
}

function closeBuilder() {
  const dlg = $('[data-builder]');
  if (dlg.open && typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  document.body.classList.remove('bld-open');
}

function initBuilder() {
  const dlg = $('[data-builder]');
  if (!dlg) return;
  dlg.addEventListener('change', updateBuilder);
  dlg.addEventListener('close', () => document.body.classList.remove('bld-open'));
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) { closeBuilder(); return; } // клик извън картата
    if (e.target.closest('[data-b-close]')) { closeBuilder(); return; }
    const all = e.target.closest('[data-b-all]');
    if (all) {
      const boxes = $$('input[name="ingredients"]', dlg);
      const full = boxes.every((i) => i.checked);
      boxes.forEach((i) => { i.checked = !full; });
      updateBuilder();
      return;
    }
    const sz = e.target.closest('[data-b-size]');
    if (sz) {
      builder.size = Number(sz.dataset.bSize);
      $$('[data-b-size]', dlg).forEach((b) => b.setAttribute('aria-checked', String(b === sz)));
      updateBuilder();
      return;
    }
    const q = e.target.closest('[data-b-step]');
    if (q) {
      builder.qty = Math.max(1, Math.min(ORDER.maxQty, builder.qty + Number(q.dataset.bStep)));
      updateBuilder();
      return;
    }
    if (e.target.closest('[data-b-add]')) {
      const btn = $('[data-b-add]', dlg);
      addToCart(builder.item.id, builder.size, undefined, btn, builderOpts(), builder.qty);
      closeBuilder();
    }
  });
}

/* --- форма --- */
const API = (document.querySelector('meta[name="order-api"]')?.content || '').trim();
const DEMO = !API && /github\.io$/.test(location.hostname);

function updateSubmit() {
  const btn = $('[data-submit]');
  if (!btn) return;
  btn.disabled = sending || !windowState.open || cart.lines.length === 0;
  $('[data-closed-note]').textContent = !windowState.open
    ? 'Бутонът се отключва от 8:00 до 10:00 (пон–пет).'
    : cart.lines.length === 0 ? 'Добави поне едно нещо в количката.' : '';
}

function setErrors(errs) {
  $$('[data-err]').forEach((el) => {
    const k = el.dataset.err;
    el.textContent = errs[k] || '';
    const input = $(`[name="${k}"]`);
    if (input) input.setAttribute('aria-invalid', errs[k] ? 'true' : 'false');
  });
}

function validate(data) {
  const errs = {};
  if (data.name.trim().length < 3) errs.name = 'Въведи имената си.';
  const digits = data.phone.replace(/[^\d]/g, '');
  if (!/^[+\d\s()\-/]+$/.test(data.phone.trim()) || digits.length < 9 || digits.length > 15) errs.phone = 'Въведи валиден телефон.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim())) errs.email = 'Въведи валиден имейл.';
  if (!data.aec) errs.aec = 'Потвърди, че доставката е в АЕЦ Козлодуй.';
  if (!data.consent) errs.consent = 'Нужно е съгласие за обработка на данните.';
  return errs;
}

function initForm() {
  const form = $('[data-order-form]');
  if (!form) return;
  const msg = $('[data-form-msg]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const fd = new FormData(form);
    const data = {
      name: String(fd.get('name') || ''), phone: String(fd.get('phone') || ''),
      email: String(fd.get('email') || ''), notes: String(fd.get('notes') || ''),
      website: String(fd.get('website') || ''), aec: fd.get('aec') === 'on', consent: fd.get('consent') === 'on',
      items: cart.lines.map((l) => ({ id: l.id, size: l.size, qty: l.qty, ...(l.flavor ? { flavor: l.flavor } : {}), ...(l.opts ? { opts: l.opts } : {}) })),
    };
    const errs = validate(data);
    setErrors(errs);
    msg.textContent = '';
    msg.className = 'form__msg';
    if (Object.keys(errs).length) {
      const first = $(`[name="${Object.keys(errs)[0]}"]`);
      if (first) first.focus();
      return;
    }
    if (!orderWindow().open) { windowState = orderWindow(); updateSubmit(); return; }

    sending = true;
    updateSubmit();
    $('[data-submit]').classList.add('is-loading');
    try {
      let result;
      if (DEMO) {
        await new Promise((r) => setTimeout(r, 700));
        result = { ok: true, orderId: 'DEMO-' + Math.floor(1000 + Math.random() * 9000), demo: true };
      } else {
        const r = await fetch(API || 'api/order', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
        result = await r.json().catch(() => ({ ok: false }));
      }
      if (result.ok) {
        showDone(result);
      } else {
        if (result.fields) setErrors(result.fields);
        msg.textContent = result.message || 'Нещо се обърка. Опитай отново.';
        msg.classList.add('is-error');
      }
    } catch {
      msg.textContent = 'Няма връзка. Провери интернета и опитай пак.';
      msg.classList.add('is-error');
    } finally {
      sending = false;
      $('[data-submit]').classList.remove('is-loading');
      updateSubmit();
    }
  });

  $('[data-new-order]')?.addEventListener('click', () => {
    $('[data-done]').hidden = true;
    form.hidden = false;
  });
}

function showDone(result) {
  const form = $('[data-order-form]');
  form.hidden = true;
  form.reset();
  cart.lines = [];
  saveCart();
  renderCart();
  $('[data-done-id]').textContent = result.orderId;
  $('[data-done-demo]').hidden = !result.demo;
  const done = $('[data-done]');
  done.hidden = false;
  sparkBurst($('.done__icon'), 40);
  done.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* --- таймер --- */
function hms(total) {
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const t = [h, m, s].map((x) => String(x).padStart(2, '0')).join(':');
  return d > 0 ? `${d} д ${t}` : t;
}

function tickTimer() {
  windowState = orderWindow();
  const w = windowState;
  const box = $('[data-timer]');
  if (box) {
    box.classList.toggle('is-open', w.open);
    if (w.open) {
      $('[data-timer-label]').textContent = 'Поръчай сега! Затваряме след';
      $('[data-timer-digits]').textContent = hms(w.secondsLeft);
      $('[data-timer-sub]').textContent = 'Приемаме поръчки до 10:00';
    } else {
      $('[data-timer-label]').textContent = 'Поръчките отварят след';
      $('[data-timer-digits]').textContent = w.secondsToOpen == null ? '--:--:--' : hms(w.secondsToOpen);
      const when = w.inDays === 0 ? 'днес' : w.inDays === 1 ? 'утре' : `в ${DAY_NAMES[w.nextDay]}`;
      $('[data-timer-sub]').textContent = `${when} в 8:00`;
    }
  }
  const mini = $('[data-mini-timer]');
  if (mini) {
    mini.classList.toggle('is-open', w.open);
    $('[data-mini-timer-text]').textContent = w.open
      ? `Поръчките за АЕЦ са отворени още ${hms(w.secondsLeft)}`
      : `Поръчки за АЕЦ след ${hms(w.secondsToOpen)}`;
  }
  updateSubmit();
}

/* ======================================================================
 * Обща част
 * ==================================================================== */
function initNav() {
  const burger = $('.burger');
  const nav = $('#nav');
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
  matchMedia('(min-width: 1061px)').addEventListener('change', (e) => { if (e.matches) set(false); });
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
  const el = $('[data-status]');
  const txt = $('[data-status-text]');
  if (el && txt) {
    el.classList.add(open ? 'is-open' : 'is-closed');
    txt.textContent = open ? `Отворено сега · до ${fmtTime(h[1])}` : `Затворено · отваряме ${nextOpening(day, min)}`;
  }
  const r = $(`[data-hours] tr[data-day="${day}"]`);
  if (r) r.classList.add('is-today');
}

/* --- пламъци --- */
function initFlames() {
  $$('[data-flames]').forEach((host) => {
    const fixed = Number(host.dataset.flamesCount);
    const count = fixed || Math.max(12, Math.min(28, Math.round(host.offsetWidth / 55)));
    let html = '';
    for (let i = 0; i < count; i++) {
      const w = (fixed ? 40 : 60) + Math.random() * (fixed ? 60 : 90);
      const h = (fixed ? 70 : 90) + Math.random() * (fixed ? 110 : 130);
      const left = (i / (count - 1 || 1)) * 100 + (Math.random() * 4 - 2);
      html += `<span class="flame" style="left:calc(${left}% - ${w / 2}px);width:${w}px;height:${h}px;--d:${(0.9 + Math.random() * 1.1).toFixed(2)}s;--delay:-${(Math.random() * 2).toFixed(2)}s"></span>`;
    }
    host.innerHTML = html;
  });
}

/* --- искри (canvas) --- */
function initEmbers() {
  const canvas = $('[data-embers]');
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, running = true;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.offsetWidth; h = canvas.offsetHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const spawn = (initial) => ({
    x: Math.random() * w, y: initial ? Math.random() * h : h + 10,
    r: 0.8 + Math.random() * 2.2, vy: 0.5 + Math.random() * 1.5, vx: (Math.random() - 0.5) * 0.5,
    life: 0, max: 200 + Math.random() * 260, hue: 18 + Math.random() * 25,
  });
  resize();
  const parts = Array.from({ length: Math.round(Math.min(80, w / 16)) }, () => spawn(true));
  const tick = () => {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      p.life++; p.y -= p.vy; p.x += p.vx + Math.sin((p.life + p.max) / 30) * 0.35;
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

/* --- изригване на искри (при „Добави“) --- */
function sparkBurst(el, n = 18) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    const a = Math.random() * Math.PI * 2;
    const d = 40 + Math.random() * 70;
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * d - 30}px`);
    document.body.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }
}

/* --- 3D наклон на транспарента --- */
function initTilt() {
  const el = $('[data-tilt]');
  if (!el || matchMedia('(hover: none), (prefers-reduced-motion: reduce)').matches) return;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
  });
  el.addEventListener('pointerleave', () => {
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  });
}

let toastTimer;
function toast(text) {
  const t = $('[data-toast]');
  if (!t) return;
  t.textContent = text;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 1800);
}

function initScrollSpy() {
  const links = $$('.nav a[href^="#"]');
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((l) => l.classList.remove('is-active'));
      const a = map.get(en.target.id);
      if (a) a.classList.add('is-active');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['hits', 'menu', 'order', 'about', 'visit'].forEach((id) => { const s = document.getElementById(id); if (s) io.observe(s); });
}

function initReveal() {
  const els = $$('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

/* --- Лого: експлозия от храна + най-горе --- */
const FOODS = ['🥙', '🌯', '🍟', '🍔', '🧀', '🥓', '🍅', '🥤', '🔥', '🌶️'];
function foodBurst(el, n = 26) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width * 0.62;
  const cy = r.top + r.height / 2;
  const parts = Array.from({ length: n }, () => {
    const s = document.createElement('span');
    s.className = 'food';
    s.textContent = FOODS[Math.floor(Math.random() * FOODS.length)];
    s.style.fontSize = `${22 + Math.random() * 24}px`;
    document.body.appendChild(s);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5; // ветрило нагоре и встрани
    const v = 5 + Math.random() * 8;
    return { s, x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 22 };
  });
  const t0 = performance.now();
  const step = (t) => {
    const k = (t - t0) / 1700;
    for (const p of parts) {
      p.vy += 0.36; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      p.s.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${p.rot}deg) scale(${1 - k * 0.3})`;
      p.s.style.opacity = String(Math.max(0, 1 - Math.max(0, k - 0.55) / 0.45));
    }
    if (k < 1) requestAnimationFrame(step);
    else parts.forEach((p) => p.s.remove());
  };
  requestAnimationFrame(step);
}

function goTop() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function initLogo() {
  $$('.logo').forEach((logo) => {
    logo.addEventListener('click', (e) => {
      e.preventDefault();
      foodBurst(logo);
      logo.classList.remove('is-pop');
      void logo.offsetWidth;
      logo.classList.add('is-pop');
      goTop();
    });
    logo.addEventListener('animationend', () => logo.classList.remove('is-pop'));
  });
}

/* При презареждане — винаги най-горе, без #котва в адреса */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
window.scrollTo(0, 0);
window.addEventListener('pageshow', (e) => { if (e.persisted) window.scrollTo(0, 0); });

/* ---------- Старт ---------- */
renderHits();
renderPromo();
renderMenu();
setCategory('all');
renderShop();
initCart();
initBuilder();
initForm();
tickTimer();
setInterval(tickTimer, 1000);
initNav();
initLogo();
initStatus();
initFlames();
initEmbers();
initTilt();
initScrollSpy();
initReveal();
const royal = itemOf('duner-royal');
const sticker = $('[data-sticker] b');
if (royal && sticker) sticker.textContent = eur(royal.prices[0]);
const { phone } = window.DUNER.BUSINESS;
if (phone) {
  const box = $('[data-phone]');
  const a = $('[data-phone-link]');
  a.textContent = phone;
  a.href = 'tel:' + phone.replace(/[^d+]/g, '');
  box.hidden = false;
}
const yr = $('[data-year]');
if (yr) yr.textContent = new Date().getFullYear();
