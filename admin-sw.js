/*
 * Service worker на панела (dunerbox.bg/admin): прави го „приложение“ на началния екран
 * и показва известие за нова поръчка. Нищо не кешира — поръчките винаги идват от сървъра.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* мрежа както обикновено */ });

// натискане на известието → отваря (или показва) панела
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = list.find((c) => new URL(c.url).pathname.startsWith('/admin'));
    if (open) return open.focus();
    return self.clients.openWindow('/admin');
  })());
});
