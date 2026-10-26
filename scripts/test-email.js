/*
 * Праща една истинска тестова поръчка през Resend:  npm run test-email
 * Чете RESEND_API_KEY, RESEND_FROM и OWNER_EMAIL от .env.
 * И двата имейла (към собственика и към „клиента“) отиват на OWNER_EMAIL,
 * освен ако не подадеш друг адрес за клиента:  npm run test-email -- client@example.com
 */
require('../load-env.js');
const { handleOrder } = require('../api/order.js');

(async () => {
  const env = process.env;
  if (!env.RESEND_API_KEY) {
    console.error('Липсва RESEND_API_KEY в .env');
    process.exit(1);
  }
  if (!env.RESEND_FROM) {
    console.error('Липсва RESEND_FROM в .env (напр. Duner Box <poruchki@твоят-домейн.bg>)');
    process.exit(1);
  }
  const customer = process.argv[2] || env.OWNER_EMAIL || 'jeki.1997@abv.bg';
  // фиксиран час в прозореца за поръчки, за да може тестът да мине по всяко време
  const now = new Date();
  const sofia = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Sofia' }));
  now.setTime(now.getTime() + ((9 * 60 + 30) - (sofia.getHours() * 60 + sofia.getMinutes())) * 60000);
  while (![1, 2, 3, 4, 5].includes(new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Sofia' })).getDay())) {
    now.setTime(now.getTime() + 86400000);
  }

  const r = await handleOrder({
    name: 'ТЕСТ Тестов', phone: '0888 123 456', email: customer, consent: true,
    notes: 'ТЕСТОВА ПОРЪЧКА — моля, игнорирайте. Сграда 2, без лук.',
    items: [
      { id: 'duner-royal', size: 0, qty: 1 },
      { id: 'sand-tarikatski', size: 1, qty: 2 },
      { id: 'drink-queens', size: 0, flavor: 'манго', qty: 1 },
      { id: 'extra-bacon', size: 0, qty: 1 },
    ],
  }, { now, env });

  console.log(`Статус: ${r.status}`, r.json);
  if (r.json.ok) {
    console.log(`Поръчка ${r.json.orderId}: имейл към собственика → ${env.OWNER_EMAIL || 'jeki.1997@abv.bg'}, потвърждение → ${customer}`);
  }
  process.exit(r.json.ok && r.json.customerEmailSent !== false ? 0 : 1);
})();
