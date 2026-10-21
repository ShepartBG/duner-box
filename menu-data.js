/*
 * Duner Box — меню и правила за поръчки.
 * Този файл се ползва и от сайта (браузъра), и от сървъра за поръчки (api/order.js),
 * така че цените са на едно място. Редактирай тук.
 *
 * price: цена в евро; null = „цена скоро“ (позицията се показва, а при поръчка
 *        цената се уточнява при доставката).
 */
(function (root) {
  const CATEGORIES = [
    { id: 'duner', label: 'Дюнери', img: 't-duner',
      note: 'Дюнер месо от шиша, пресни зеленчуци и чеснов сос. Избери си размера.' },
    { id: 'box', label: 'Duner Box', img: 't-box',
      note: 'Дюнер месо, картофки, салата и сосове, натъпкани в кутия.' },
    { id: 'sandwich', label: 'Грил сандвичи', img: 't-pita', wide: true,
      sub: 'малък 330 гр. · голям 480 гр.', sizes: ['малък', 'голям'] },
    { id: 'pocket', label: 'Джоб', img: 't-pocket', sub: '600 гр.' },
    { id: 'burger', label: 'Бургери', img: 't-burger' },
    { id: 'salad', label: 'Салати', img: 't-salad' },
    { id: 'sides', label: 'Гарнитури', img: 't-fries', sub: 'по 100 гр.' },
    { id: 'extras', label: 'Добавки', img: 't-bacon', compact: true,
      note: 'Сложи отгоре на каквото си избрал. Цените са на бара.' },
    { id: 'drinks', label: 'Напитки', img: 't-cola',
      note: 'Студени, направо от хладилника. Цените са на бара.' },
  ];

  const MENU = [
    // Дюнери
    { id: 'duner-small', cat: 'duner', name: 'Дюнер малък', prices: [4.0] },
    { id: 'duner-medium', cat: 'duner', name: 'Дюнер среден', prices: [4.5] },
    { id: 'duner-large', cat: 'duner', name: 'Дюнер голям', prices: [5.0] },
    { id: 'duner-royal', cat: 'duner', name: 'Дюнер кралски', tag: 'Хит', prices: [8.0],
      desc: 'Най-големият ни дюнер. Не е за слабите духом.',
      hit: 1, badge: 'Кралски размер', photo: 'wrap-fire' },

    // Duner Box
    { id: 'box-small', cat: 'box', name: 'Duner Box малък', prices: [5.0],
      desc: 'Дюнер месо, картофки, салата и сосове в кутия.' },
    { id: 'box-large', cat: 'box', name: 'Duner Box голям', tag: 'Подпис', prices: [6.0],
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
    { id: 'side-fries', cat: 'sides', name: 'Картофки', desc: '100 гр.', prices: [2.5], img: 't-fries' },
    { id: 'side-rice', cat: 'sides', name: 'Ориз', desc: '100 гр.', prices: [2.0], img: 't-rice' },
    { id: 'side-meat', cat: 'sides', name: 'Месо', desc: '100 гр. дюнер месо', prices: [3.0], img: 't-donermeat' },

    // Добавки — цените предстоят
    { id: 'extra-kofte', cat: 'extras', name: 'Телешко кюфте', prices: [null] },
    { id: 'extra-bacon', cat: 'extras', name: 'Бекон', prices: [null] },
    { id: 'extra-cheese', cat: 'extras', name: 'Кашкавал', prices: [null] },
    { id: 'extra-egg', cat: 'extras', name: 'Яйце', prices: [null] },
    { id: 'extra-melted', cat: 'extras', name: 'Топено сирене', prices: [null] },

    // Напитки — цените предстоят
    { id: 'drink-cola', cat: 'drinks', name: 'Coca-Cola', prices: [null], img: 't-cola' },
    { id: 'drink-zero', cat: 'drinks', name: 'Coca-Cola Zero', prices: [null], img: 't-zero' },
    { id: 'drink-tea', cat: 'drinks', name: 'Студен чай', prices: [null], img: 't-tea' },
    { id: 'drink-water', cat: 'drinks', name: 'Вода', prices: [null], img: 't-water' },
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

  const data = { CATEGORIES, MENU, HOURS, ORDER, TZ, DAY_NAMES, sofiaNow, orderWindow, priceOf, round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.DUNER = data;
})(typeof window !== 'undefined' ? window : globalThis);
