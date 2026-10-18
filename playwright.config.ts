import { defineConfig } from '@playwright/test';
import { chromiumLaunchOptions } from './e2e/helpers/chromium.cjs';

// P0 smoke suite: drives the real app on the Metro web server (the live preview).
// Reuses the already-running server on :4000; starts one itself otherwise.
const launch = chromiumLaunchOptions();

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4000',
    viewport: { width: 390, height: 844 },
    launchOptions: { executablePath: launch.executablePath, args: launch.args, headless: true },
    // First navigation of a cold Metro server compiles the whole app bundle.
    navigationTimeout: 180_000,
    actionTimeout: 20_000,
  },
  webServer: {
    url: 'http://localhost:4000',
    command: 'EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npx expo start --port 4000',
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
