import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const e2ePort = Number(process.env.PLAYWRIGHT_TEST_PORT || '4322');
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const rendererPort = e2ePort + 1;
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
const hybridManifest = fileURLToPath(new URL('./dist-hybrid/hybrid-api-docs.json', import.meta.url));
const statichostAssembly = fileURLToPath(
  new URL('../statichost/StaticHost/bin/Release/net10.0/StaticHost.dll', import.meta.url),
);
const serverEnv = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
const serverOptions = { reuseExistingServer: false, stdout: 'pipe', stderr: 'pipe', timeout: 120000 };

// In CI the build job has already produced the hybrid artifact, which each e2e job downloads
// into `dist-hybrid/`. Only StaticHost can serve it: the prerendered client comes
// from its files while API pages and `/_image` are rendered on demand by a private Astro
// renderer. `astro preview` cannot, because the node adapter's middleware-mode preview
// server has no static file handler. Locally we keep `astro dev` so interactive work
// doesn't require a full build, and because under `astro dev` the first request to each
// page triggers twoslash processing, CI must not use it: that stacks up under parallel
// test workers and blows past the default 30s test timeout.
const webServer = isCI
  ? [
      {
        command: 'node scripts/serve-api-docs.mjs',
        env: {
          ...serverEnv,
          HOST: '127.0.0.1',
          PORT: String(rendererPort),
          HYBRID_API_DOCS_MANIFEST: hybridManifest,
        },
        url: `${rendererUrl}/__hybrid-api-docs/health`,
        ...serverOptions,
      },
      {
        command: `dotnet "${statichostAssembly}"`,
        env: {
          ...serverEnv,
          ASPNETCORE_URLS: e2eBaseUrl,
          ASPNETCORE_ENVIRONMENT: 'Production',
          HybridApiDocs__ArtifactPath: hybridManifest,
          HybridApiDocs__RendererUrls__0: rendererUrl,
          // StaticHost's live-status services need a Redis connection string to start. CI
          // provides Redis; `abortConnect=false` still lets the host start without one.
          ConnectionStrings__cache: process.env.ConnectionStrings__cache || '127.0.0.1:6379,abortConnect=false',
          Live__Twitch__ClientId: '',
          Live__YouTube__ApiKey: '',
        },
        url: `${e2eBaseUrl}/healthz/api-docs`,
        ...serverOptions,
      },
    ]
  : {
      command: `pnpm git-env && pnpm check-data && astro dev --host 127.0.0.1 --port ${e2ePort}`,
      env: serverEnv,
      url: e2eBaseUrl,
      ...serverOptions,
    };

export default defineConfig({
  testDir: './tests/e2e',
  // Asserts the two-renderer failover that only the acceptance harness provides; it runs
  // through playwright.hybrid.config.mjs.
  testIgnore: 'hybrid-api-docs.spec.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  // Default (30s) is tight once twoslash code blocks add server-side work
  // during dev mode. 60s gives `page.goto` enough headroom without masking
  // real regressions.
  timeout: 60_000,
  // CI shards each viewport project across separate runners and stitches
  // the per-shard `blob-report/` outputs into a single HTML report in a
  // dedicated `report` job. We keep `github` (workflow annotations) and
  // `junit` (XML for external tooling) on every shard so we don't lose
  // them by sharding. The `html` reporter is intentionally omitted from
  // CI: per-shard HTML reports would have to be discarded anyway, since
  // `playwright merge-reports` regenerates a unified HTML report from
  // the blob outputs.
  reporter: isCI
    ? [
        ['blob'],
        ['github'],
        ['list'],
        ['junit', { outputFile: 'test-results/junit/results.xml' }],
      ]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: e2eBaseUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'tablet-chromium',
      use: {
        browserName: 'chromium',
        ...devices['iPad Pro 11'],
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        ...devices['Pixel 7'],
      },
    },
  ],
  webServer,
});
