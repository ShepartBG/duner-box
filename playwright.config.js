const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    timezoneId: 'Europe/Sofia',
    locale: 'bg-BG',
  },
  projects: [
    // сайтът — на компютър и на телефон
    { name: 'desktop', testIgnore: /(api|decision)\.spec\.js/, grepInvert: /@mobile/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', testIgnore: /(api|decision)\.spec\.js/, grepInvert: /@desktop/, use: { ...devices['Pixel 7'] } },
    // сървърът (поръчки, имейли, одобрение) — не зависи от устройството, пуска се веднъж
    { name: 'api', testMatch: /(api|decision)\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node server.js',
    // RESEND_API_KEY празен: тестовете никога не пращат истински имейли, дори ако .env има ключ
    env: { PORT: '5174', ALLOW_TEST_CLOCK: '1', RESEND_API_KEY: '', ORDER_SECRET: 'test-server-secret', ADMIN_PASSWORD: 'test-admin' },
    url: 'http://localhost:5174',
    reuseExistingServer: true,
  },
});
