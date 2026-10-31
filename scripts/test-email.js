/*
 * Праща една истинска тестова поръчка през Resend:  npm run test-email
 * Чете RESEND_API_KEY и RESEND_FROM от .env. Праща само имейла „Получихме поръчката“ до клиента.
 * По подразбиране отива на jeki.1997@abv.bg (тестовият адрес),
 * или на друг адрес:  npm run test-email -- client@example.com
 */
require('../load-env.js');
const { handleOrder } = require('../api/order.js');

(async () => {
  const env = process.env;
  if (!env.RESEND_API_KEY) {
    console.error('Липсва RESEND_API_KEY в .env');
    process.exitCode = 1; return;
  }
  if (!env.RESEND_FROM) {
    console.error('Липсва RESEND_FROM в .env (напр. Duner Box <poruchki@твоят-домейн.bg>)');
    process.exitCode = 1; return;
  }
  const customer = process.argv[2] || 'jeki.1997@abv.bg';
  // фиксиран час в прозореца за поръчки, за да може тестът да мине по всяко време
  const now = new Date();
  const sofia = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Sofia' }));
  now.setTime(now.getTime() + ((8 * 60 + 30) - (sofia.getHours() * 60 + sofia.getMinutes())) * 60000);
  while (![1, 2, 3, 4, 5].includes(new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Sofia' })).getDay())) {
    now.setTime(now.getTime() + 86400000);
  }

  const r = await handleOrder({
    name: 'ТЕСТ Тестов', phone: '0888 123 456', email: customer, address: 'ТЕСТ — Сграда 2', consent: true, aec: true,
    notes: 'ТЕСТОВА ПОРЪЧКА — моля, игнорирайте. Сграда 2, без лук.',
    items: [
      { id: 'duner-royal', size: 0, qty: 1, opts: { ingredients: ['зеле', 'краставица', 'домат', 'маруля', 'лук пържен', 'картофи', 'месо', 'кисела краставичка'], sauces: ['чеснов', 'люто'], extras: ['extra-bacon'] } },
      { id: 'sand-tarikatski', size: 1, qty: 2, opts: { ingredients: ['зеле', 'домат'], sauces: ['самурай'], extras: ['extra-kofte'] } },
      { id: 'side-fries', size: 0, qty: 1, opts: { sauces: ['кетчуп', 'шарена сол'] } },
      { id: 'drink-queens', size: 0, flavor: 'манго', qty: 1 },
    ],
  }, { now, env });

  console.log(`Статус: ${r.status}`, r.json);
  if (r.json.ok) {
    console.log(`Поръчка ${r.json.orderId}: потвърждение → ${customer}`);
  }
  process.exitCode = r.json.ok && r.json.customerEmailSent !== false ? 0 : 1;
})();
