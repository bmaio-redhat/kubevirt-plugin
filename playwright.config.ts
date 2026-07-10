import * as path from 'path';

import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

import type { ReporterDescription } from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';

import { EnvVariables } from './playwright/src/utils/env-variables';
import { getStorageStatePath } from './playwright/src/utils/storage-state';
import { getTestResultsDir } from './playwright/src/utils/test-results-dir';

const chromeArgs = [
  '--ignore-certificate-errors',
  '--start-maximized',
  '--window-size=1920,1080',
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-background-networking',
  '--disable-client-side-phishing-detection',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-popup-blocking',
  '--disable-sync',
  '--disable-translate',
  '--no-first-run',
  '--js-flags=--max-old-space-size=4096',
  ...(process.env.DIAGNOSE_FAILURES === '1' ? ['--remote-debugging-port=0'] : []),
];

const testResultsDir = getTestResultsDir(__dirname);

function getReporterConfig(resultsDir: string): ReporterDescription[] {
  const allureReporter: ReporterDescription = [
    path.resolve(__dirname, 'playwright', 'src', 'utils', 'allure-no-stdout-reporter.ts'),
    { detail: true, resultsDir, suiteTitle: true },
  ];

  if (EnvVariables.isDebugMode) {
    return [['list']];
  }

  if (EnvVariables.isSharded) {
    const junitFile = path.resolve(
      __dirname,
      'junit-results',
      `junit-shard-${EnvVariables.shardIndex}.xml`,
    );
    return [allureReporter, ['junit', { outputFile: junitFile }]];
  }

  const junitFile = path.resolve(__dirname, 'junit-results', 'junit.xml');
  return [['list'], allureReporter, ['junit', { outputFile: junitFile }]];
}

export default defineConfig({
  forbidOnly: EnvVariables.isCI,
  fullyParallel: true,

  globalSetup: path.resolve(__dirname, 'playwright', 'project-dependencies', 'global.setup.ts'),
  globalTeardown: path.resolve(
    __dirname,
    'playwright',
    'project-dependencies',
    'global.teardown.ts',
  ),

  projects: [
    {
      name: 'Gating',
      testMatch: '**/tests/gating/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: chromeArgs,
          headless: !EnvVariables.isDebugMode && !process.env.HEADED,
        },
      },
    },
    {
      name: 'Tier 1',
      testMatch: '**/tests/tier1/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: chromeArgs,
          headless: !EnvVariables.isDebugMode && !process.env.HEADED,
        },
      },
    },
    {
      name: 'Migrations',
      testMatch: '**/tests/migrations/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: chromeArgs,
          headless: !EnvVariables.isDebugMode && !process.env.HEADED,
        },
      },
    },
    {
      name: 'Tier 2',
      testMatch: '**/tests/tier2/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: chromeArgs,
          headless: !EnvVariables.isDebugMode && !process.env.HEADED,
        },
      },
    },
    {
      name: 'CNV Settings',
      testMatch: '**/tests/settings/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: chromeArgs,
          headless: !EnvVariables.isDebugMode && !process.env.HEADED,
        },
      },
    },
    {
      name: 'Non-Priv',
      testMatch: '**/tests/nonpriv/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: chromeArgs,
          headless: !EnvVariables.isDebugMode && !process.env.HEADED,
        },
      },
    },
    {
      name: 'API Tests',
      testMatch: '**/tests/api/**/*.spec.ts',
      testIgnore: '**/tests/api/nonpriv-api.spec.ts',
      use: {
        baseURL: EnvVariables.webConsoleUrl,
        actionTimeout: 15 * 1000,
        navigationTimeout: 15 * 1000,
        ignoreHTTPSErrors: true,
      },
    },
    {
      name: 'Non-Priv API',
      testMatch: '**/tests/api/nonpriv-api.spec.ts',
      use: {
        baseURL: EnvVariables.webConsoleUrl,
        actionTimeout: 15 * 1000,
        navigationTimeout: 15 * 1000,
        ignoreHTTPSErrors: true,
      },
    },
  ],
  reporter: getReporterConfig(testResultsDir),

  retries: EnvVariables.retries,

  expect: {
    timeout: EnvVariables.isNonPrivUser ? 45 * 1000 : 30 * 1000,
  },

  testDir: './playwright/tests',

  testMatch: '**/*.spec.ts',

  outputDir: testResultsDir,

  timeout: 480 * 1000,

  use: {
    baseURL: EnvVariables.webConsoleUrl,
    storageState: getStorageStatePath(path.resolve(__dirname, 'playwright')),

    screenshot: 'off',
    trace: 'off',
    video: 'off',

    actionTimeout: 60 * 1000,
    navigationTimeout: 90 * 1000,
    ignoreHTTPSErrors: true,

    launchOptions: {
      slowMo: 0,
    },
  },

  workers: (() => {
    if (process.env.WORKERS) return parseInt(process.env.WORKERS, 10);
    if (EnvVariables.isCI) return 1;
    return undefined;
  })(),
});
