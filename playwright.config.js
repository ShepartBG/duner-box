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
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node server.js',
    env: { PORT: '5174', ALLOW_TEST_CLOCK: '1' },
    url: 'http://localhost:5174',
    reuseExistingServer: true,
  },
});
