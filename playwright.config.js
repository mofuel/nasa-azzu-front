import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  use: {baseURL: 'http://127.0.0.1:5201', screenshot: 'only-on-failure'},
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5201 --strictPort',
    url: 'http://127.0.0.1:5201',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {name: 'desktop', use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}}},
    {name: 'mobile', use: {...devices['Pixel 7']}},
  ],
});