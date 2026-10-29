/*
 * Duner Box — меню и правила за поръчки.
 * Този файл се ползва и от сайта (браузъра), и от сървъра за поръчки (api/order.js),
 * така че цените са на едно място. Редактирай тук.
 *
 * Снимка: assets/img/items/<id>.webp — по една за всяка позиция.
 * prices:  цени в евро; null = „цена скоро“ (при поръчка цената се уточнява при доставката).
 *          Няколко цени = няколко размера; имената им са в labels (или sizes на категорията).
 * cutout:  снимката е изрязан продукт с прозрачен фон (показва се цял, със сияние).
 * flavors: списък с вкусове на една и съща цена — клиентът избира един при поръчка.
 * options (на категория): какво клиентът си избира при поръчка — 'ingredients' (безплатни съставки),
 *          'sauces' (безплатни сосове и подправки), 'extras' (платени добавки от категория „Добавки“).
 * shop: false (на категория) — не се показва като отделен раздел в магазина.
 */
(function (root) {
  const CATEGORIES = [
    { id: 'duner', label: 'Дюнери', options: ['ingredients', 'sauces', 'extras'],
      note: 'Дюнер месо от шиша, пресни зеленчуци и чеснов сос. Избери си размера.' },
    { id: 'box', label: 'Duner Box', options: ['ingredients', 'sauces', 'extras'],
      note: 'Дюнер месо, картофки, салата и сосове, натъпкани в кутия.' },
    { id: 'sandwich', label: 'Грил сандвичи', wide: true, options: ['ingredients', 'sauces', 'extras'],
      sub: 'малък 330 гр. · голям 480 гр.', sizes: ['малък', 'голям'] },
    { id: 'pocket', label: 'Джоб', sub: '600 гр.', options: ['ingredients', 'sauces', 'extras'] },
    { id: 'burger', label: 'Бургери', options: ['ingredients', 'sauces', 'extras'] },
    { id: 'salad', label: 'Салати', options: ['ingredients', 'sauces', 'extras'] },
    { id: 'sides', label: 'Гарнитури', sub: 'по 100 гр.', options: ['sauces'] },
    { id: 'extras', label: 'Добавки', compact: true, shop: false,
      note: 'Добави ги към дюнер, кутия, сандвич, джоб, бургер или салата, когато поръчваш.' },
    { id: 'drinks', label: 'Напитки',
      note: 'Студени, направо от хладилника. Избери си вкуса.' },
  ];

  const MENU = [
    // Дюнери
    { id: 'duner-small', cat: 'duner', name: 'Дюнер малък', prices: [4.0] },
    { id: 'duner-medium', cat: 'duner', name: 'Дюнер среден', prices: [4.5] },
    { id: 'duner-large', cat: 'duner', name: 'Дюнер голям', prices: [5.0] },
    { id: 'duner-royal', cat: 'duner', name: 'Дюнер кралски', tag: 'Хит', prices: [8.0],
      desc: 'Най-големият ни дюнер. Не е за слабите духом.',
      hit: 1, badge: 'Кралски размер', photo: 'doner-real' },

    // Duner Box
    { id: 'box-small', cat: 'box', name: 'Duner Box малък', prices: [5.0],
      desc: 'Дюнер месо, картофки, салата и сосове в кутия.' },
    { id: 'box-large', cutout: true, cat: 'box', name: 'Duner Box голям', tag: 'Подпис', prices: [6.0],
      desc: 'Същото, но по-голямо. Защото малкото никога не стига.',
      hit: 2, badge: 'Нашият подпис', photo: 'box' },

    // Грил сандвичи (малък 330 гр. / голям 480 гр.)
    { id: 'sand-donvito', cat: 'sandwich', name: 'Дон Вито', prices: [5.0, 6.0],
      desc: 'Дюнер месо, картофи, чеснов сос, зеле, краставица, домат, зелена салата.' },
    { id: 'sand-tarikatski', cat: 'sandwich', name: 'Тарикатски', prices: [5.0, 6.0],
      desc: 'Картофи, чеснов сос, телешко кюфте, запечен бекон, кашкавал, зеле, краставица, домат, зелена салата.' },
    { id: 'sand-royal', cat: 'sandwich', name: 'Роял', tag: 'Хит', prices: [4.5, 5.0],
      desc: 'Картофи, чеснов сос, шунка, луканка, бекон, кашкавал, зеле, краставица, домат, зелена салата.',
      hit: 3, badge: 'Грил хит', photo: 'sandwich-hand' },
    { id: 'sand-ham', cat: 'sandwich', name: 'Шунка и кашкавал', prices: [4.5, 5.0],
      desc: 'Картофи, чеснов сос, шунка, кашкавал, зеле, краставица, домат, зелена салата.' },
    { id: 'sand-majo', cat: 'sandwich', name: 'Маджо', prices: [4.5, 5.0],
      desc: 'Картофи, чеснов сос, кашкавал, топено сирене, зеле, пармезан, чедър, краставица, домат, зелена салата.' },
    { id: 'sand-pacific', cat: 'sandwich', name: 'Пасифик', prices: [5.0, 5.5],
      desc: 'Картофи, чеснов сос, риба тон, зеле, краставица, домат, зелена салата, лук.' },

    // Джоб — 600 гр.
    { id: 'pocket-combo', cat: 'pocket', name: 'Джоб комбиниран', prices: [5.0],
      desc: 'Шунка, луканка, бекон и кашкавал. 600 гр.' },
    { id: 'pocket-meat', cat: 'pocket', name: 'Джоб с месо', prices: [6.0],
      desc: 'Пълен с месо. 600 гр.' },

    // Бургери
    { id: 'burger-chicken', cat: 'burger', name: 'Пилешки бургер', prices: [6.0],
      desc: 'Зелена салата, домат, пресен лук, кисела краставица, самурай, барбекю.' },
    { id: 'burger-beef', cat: 'burger', name: 'Телешки бургер', prices: [7.0],
      desc: 'Зелена салата, домат, пресен лук, кисела краставица, самурай, барбекю, препечен бекон.' },

    // Салати
    { id: 'salad-doner-small', cat: 'salad', name: 'Дюнер салата малка', prices: [6.0],
      desc: 'Месо, чеснов сос, зеле, краставица, домат, зелена салата. 750 мл.' },
    { id: 'salad-doner-large', cat: 'salad', name: 'Дюнер салата голяма', prices: [7.0],
      desc: 'Месо, чеснов сос, зеле, краставица, домат, зелена салата. 1000 мл.' },
    { id: 'salad-tuna', cat: 'salad', name: 'Зелена салата с риба тон', prices: [6.0],
      desc: 'Риба тон, чеснов сос, зеле, краставица, домат, зелена салата. 400 гр.' },

    // Гарнитури — по 100 гр.
    { id: 'side-fries', cat: 'sides', name: 'Картофки', desc: '100 гр.', prices: [2.5] },
    { id: 'side-rice', cat: 'sides', name: 'Ориз', desc: '100 гр.', prices: [2.0] },
    { id: 'side-meat', cat: 'sides', name: 'Допълнително месо', desc: '100 гр. дюнер месо', prices: [3.0] },

    // Добавки (по избор към храната)
    { id: 'extra-kofte', cat: 'extras', name: 'Телешко кюфте', prices: [2.0] },
    { id: 'extra-bacon', cat: 'extras', name: 'Бекон', prices: [1.0] },
    { id: 'extra-lukanka', cat: 'extras', name: 'Луканка', prices: [1.0] },
    { id: 'extra-ham', cat: 'extras', name: 'Шунка', prices: [1.0] },
    { id: 'extra-cheese', cat: 'extras', name: 'Кашкавал', prices: [1.0] },
    { id: 'extra-cheddar', cat: 'extras', name: 'Чедър', prices: [1.0] },
    { id: 'extra-melted', cat: 'extras', name: 'Топено сирене', prices: [1.0] },
    { id: 'extra-egg', cat: 'extras', name: 'Яйце', prices: [1.0] },
    { id: 'extra-pita', cat: 'extras', name: 'Питка', prices: [1.0] },
    { id: 'extra-rice', cat: 'extras', name: 'Ориз', prices: [1.0] },
    { id: 'extra-fries', cat: 'extras', name: 'Картофи', prices: [1.0] },

    // Напитки
    { id: 'drink-cola', cat: 'drinks', name: 'Coca-Cola', desc: 'Кен.', prices: [1.5] },
    { id: 'drink-zero', cat: 'drinks', name: 'Coca-Cola Zero', desc: 'Кен.', prices: [1.5] },
    { id: 'drink-tea', cutout: true, cat: 'drinks', name: 'Студен чай Nestea', prices: [1.5],
      flavors: ['лимон', 'праскова', 'манго', 'горски плодове'] },
    { id: 'drink-fizzy', cat: 'drinks', name: 'Физи', prices: [1.5],
      flavors: ['ягода и ябълка', 'ананас и манго', 'тути фрути', 'портокал и манго'] },
    { id: 'drink-queens', cutout: true, cat: 'drinks', name: 'Куинс', prices: [1.5],
      flavors: ['кайсия', 'портокал', 'банан', 'праскова', 'ябълка', 'банан и ягода', 'малина', 'манго', 'боровинка', 'къпина', 'драконов плод'] },
    { id: 'drink-drvit', cutout: true, cat: 'drinks', name: 'Др. Вит', prices: [1.5],
      flavors: ['ягода', 'нар и асаи', 'черна боровинка и хибискус', 'праскова'] },
    { id: 'drink-hiho', cutout: true, cat: 'drinks', name: 'Хихо', prices: [1.5],
      flavors: ['праскова', 'тути фрути', 'ягода', 'круша', 'боровинка'] },
    { id: 'drink-hell', cutout: true, cat: 'drinks', name: 'Хел', desc: 'Енергийна напитка.', prices: [1.5],
      flavors: ['класик', 'зеро', 'ябълка', 'зелена ябълка', 'диня', 'червено грозде', 'черна череша', 'розова гуава'] },
    { id: 'drink-icecoffee', cat: 'drinks', name: 'Айс кафе', prices: [1.5],
      flavors: ['Pink Latte', 'капучино', 'лате', 'двойно еспресо'] },
    { id: 'drink-isosport', cutout: true, cat: 'drinks', name: 'Изо спорт', prices: [1.5] },
    { id: 'drink-ayran', cutout: true, cat: 'drinks', name: 'Айрян Мегле', prices: [1.5] },
    { id: 'drink-velingrad', cutout: true, cat: 'drinks', name: 'Велинград', desc: 'Минерална вода.', prices: [0.5, 1.0], labels: ['0,5 л', '1,5 л'] },
    { id: 'drink-velingrad-flavor', cutout: true, cat: 'drinks', name: 'Велинград с вкус', desc: '0,5 л.', prices: [1.5],
      flavors: ['праскова', 'ягода', 'лимон'] },
    { id: 'drink-water', cutout: true, cat: 'drinks', name: 'Горна баня', desc: 'Минерална вода.', prices: [0.5, 1.0], labels: ['0,5 л', '1,5 л'] },
  ];

  /* Работно време на обекта: 0 = неделя ... 6 = събота; [отваря, затваря] в минути */
  const HOURS = {
    0: null,
    1: [510, 1140], 2: [510, 1140], 3: [510, 1140], 4: [510, 1140], 5: [510, 1140],
    6: [600, 1080],
  };

  /* Поръчки за вкъщи — само за АЕЦ Козлодуй */
  const ORDER = {
    start: 9 * 60,          // 9:00
    end: 10 * 60,           // 10:00
    days: [1, 2, 3, 4, 5],  // понеделник – петък
    deliveryMinutes: 30,
    area: 'АЕЦ Козлодуй',
    payment: 'само в брой',
    maxQty: 20,
  };

  const TZ = 'Europe/Sofia';
  const DAY_NAMES = ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'];

  /* Текущ ден / минута / секунда по софийско време */
  function sofiaNow(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date || new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    const sec = Number(get('hour')) * 3600 + Number(get('minute')) * 60 + Number(get('second'));
    return { day, min: Math.floor(sec / 60), sec };
  }

  /* Състояние на прозореца за поръчки: open + секунди до затваряне/отваряне */
  function orderWindow(date) {
    const { day, sec } = sofiaNow(date);
    const s0 = ORDER.start * 60;
    const s1 = ORDER.end * 60;
    if (ORDER.days.includes(day) && sec >= s0 && sec < s1) {
      return { open: true, secondsLeft: s1 - sec };
    }
    for (let k = 0; k < 8; k++) {
      const d = (day + k) % 7;
      if (!ORDER.days.includes(d)) continue;
      if (k === 0 && sec >= s0) continue;
      return { open: false, secondsToOpen: k * 86400 + s0 - sec, nextDay: d, inDays: k };
    }
    return { open: false, secondsToOpen: null };
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  /* Цена и етикет за позиция + размер (size е индекс в prices) */
  function priceOf(itemId, size) {
    const item = MENU.find((m) => m.id === itemId);
    if (!item) return undefined;
    const i = Number(size) || 0;
    if (i < 0 || i >= item.prices.length) return undefined;
    return item.prices[i];
  }

  /* Безплатни съставки и сосове, които клиентът маркира при поръчка */
  const INGREDIENTS = ['зеле', 'краставица', 'домат', 'маруля', 'лук пържен', 'лук пресен', 'картофи', 'месо', 'кисела краставичка'];
  const SAUCES = ['чеснов', 'самурай', 'люто', 'кетчуп', 'барбекю', 'майонеза', 'горчица обикновена', 'горчица медена', 'чедър', 'сол', 'шарена сол'];

  /*
   * Проверява и подрежда избора на клиента за дадена позиция.
   * Връща { ingredients, sauces, extras, extraPrice } или null, ако изборът е невалиден.
   */
  function normalizeOptions(item, opts) {
    const cat = CATEGORIES.find((c) => c.id === item.cat);
    const allowed = (cat && cat.options) || [];
    const o = opts && typeof opts === 'object' ? opts : {};
    const pick = (key, list) => {
      const v = o[key] == null ? [] : o[key];
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return null;
      if (v.length && !allowed.includes(key)) return null;
      if (new Set(v).size !== v.length || v.some((x) => !list.includes(x))) return null;
      return list.filter((x) => v.includes(x)); // в реда от менюто
    };
    const extraIds = MENU.filter((m) => m.cat === 'extras').map((m) => m.id);
    const ingredients = pick('ingredients', INGREDIENTS);
    const sauces = pick('sauces', SAUCES);
    const extras = pick('extras', extraIds);
    if (!ingredients || !sauces || !extras) return null;
    const extraPrice = round2(extras.reduce((a, id) => a + (MENU.find((m) => m.id === id).prices[0] || 0), 0));
    return { ingredients, sauces, extras, extraPrice };
  }

  /* Кратко описание на избора: „всичко без лук пресен · сосове: чеснов, люто · + бекон“ */
  function optionsSummary(item, opts) {
    const cat = CATEGORIES.find((c) => c.id === item.cat);
    const allowed = (cat && cat.options) || [];
    if (!allowed.length || !opts) return '';
    const parts = [];
    if (allowed.includes('ingredients')) {
      const ing = opts.ingredients || [];
      const missing = INGREDIENTS.filter((x) => !ing.includes(x));
      if (!ing.length) parts.push('без съставки');
      else if (!missing.length) parts.push('със всичко');
      else if (missing.length <= 3) parts.push('всичко без ' + missing.join(', '));
      else parts.push('с ' + ing.join(', '));
    }
    if (allowed.includes('sauces')) parts.push((opts.sauces || []).length ? 'сосове: ' + opts.sauces.join(', ') : 'без сос');
    const ex = (opts.extras || []).map((id) => MENU.find((m) => m.id === id)).filter(Boolean);
    if (ex.length) parts.push(ex.map((m) => '+ ' + m.name.toLowerCase()).join(', '));
    return parts.join(' · ');
  }

  /* Имената на размерите на позиция (labels на позицията или sizes на категорията) */
  function sizeLabels(item) {
    if (item.labels) return item.labels;
    const cat = CATEGORIES.find((c) => c.id === item.cat);
    return (cat && cat.sizes) || [];
  }

  /* Фирмата (показва се във футъра и в имейлите). phone: null = още няма — не се показва. */
  const BUSINESS = {
    brand: 'Duner Box',
    company: 'Станислав Стоянов-94 ЕООД',
    eik: '206587193',
    address: 'ул. Търговска 77, 3320 Козлодуй',
    phone: null,
  };

  const data = { CATEGORIES, MENU, HOURS, ORDER, TZ, DAY_NAMES, BUSINESS, INGREDIENTS, SAUCES,
    sofiaNow, orderWindow, priceOf, round2, sizeLabels, normalizeOptions, optionsSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.DUNER = data;
})(typeof window !== 'undefined' ? window : globalThis);
