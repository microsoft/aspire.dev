import { createHash } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

/** @param {number[]} values @returns {number} */
export function median(values) {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('Median requires nonempty finite measurements.');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** @param {number} extraBytes @param {number} megabitsPerSecond @returns {number} */
export function transferPenaltyMs(extraBytes, megabitsPerSecond) {
  if (!Number.isFinite(extraBytes) || !Number.isFinite(megabitsPerSecond) || megabitsPerSecond <= 0) {
    throw new Error('Invalid transfer model inputs.');
  }
  return extraBytes * 8 / (megabitsPerSecond * 1000);
}

async function run(baseUrl, manifestPath, variant, output) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const environment = {
    node: process.version, chromium: browser.version(), platform: process.platform,
    architecture: process.arch, runnerImage: process.env.ImageVersion, sourceCommit: process.env.GITHUB_SHA,
  };
  const samples = [];
  const serverBefore = await (await fetch(`${baseUrl}/__profile/stats`)).json();
  try {
    for (const scenario of ['desktop', 'mobile-like']) {
      for (const target of manifest.pages) {
        for (let trial = 0; trial < 3; trial++) {
          const context = await browser.newContext({
            viewport: scenario === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
            locale: 'en-US',
          });
          try {
            await context.route('**/*', (route) => {
              return new URL(route.request().url()).origin === new URL(baseUrl).origin
                ? route.continue() : route.abort();
            });
            for (const cache of ['cold', 'warm']) {
              const page = await context.newPage();
              try {
                const session = await context.newCDPSession(page);
                await session.send('Network.enable');
                if (cache === 'cold') await session.send('Network.clearBrowserCache');
                await session.send('Performance.enable');
                if (scenario === 'mobile-like') {
                  await session.send('Network.emulateNetworkConditions', {
                    offline: false, latency: 40, downloadThroughput: 625000, uploadThroughput: 312500,
                  });
                  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
                }
                await page.addInitScript(() => {
                  globalThis.__compressionLcp = null;
                  new PerformanceObserver((list) => {
                    globalThis.__compressionLcp = list.getEntries().at(-1)?.startTime ?? null;
                  }).observe({ type: 'largest-contentful-paint', buffered: true });
                });
                const response = await page.goto(`${baseUrl}/${target.path}`, { waitUntil: 'load', timeout: 60000 });
                if (!response || response.status() !== 200 || response.headers()['content-encoding'] !== 'br') {
                  throw new Error(`Expected a successful Brotli response for ${target.path}.`);
                }
                const hash = createHash('sha256').update(await response.body()).digest('hex').toUpperCase();
                if (hash !== target.sha256) throw new Error(`Browser received different content: ${target.path}.`);
                await page.waitForTimeout(1000);
                const timing = await page.evaluate(() => {
                  const navigation = performance.getEntriesByType('navigation')[0];
                  const resources = performance.getEntriesByType('resource').filter((entry) =>
                    new URL(entry.name).origin === globalThis.location.origin);
                  return {
                    ttfbMs: navigation.responseStart - navigation.requestStart,
                    downloadMs: navigation.responseEnd - navigation.responseStart,
                    domContentLoadedMs: navigation.domContentLoadedEventEnd,
                    loadMs: navigation.loadEventEnd,
                    fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
                    lcpMs: globalThis.__compressionLcp,
                    documentEncodedBytes: navigation.encodedBodySize,
                    documentDecodedBytes: navigation.decodedBodySize,
                    transferBytes: navigation.transferSize + resources.reduce((sum, entry) => sum + entry.transferSize, 0),
                  };
                });
                const performanceMetrics = Object.fromEntries((await session.send('Performance.getMetrics'))
                  .metrics.map(({ name, value }) => [name, value]));
                samples.push({
                  variant, scenario, page: target.name, path: target.path, trial, cache, ...timing,
                  mainThreadTaskMs: performanceMetrics.TaskDuration * 1000,
                  scriptMs: performanceMetrics.ScriptDuration * 1000,
                  layoutMs: performanceMetrics.LayoutDuration * 1000,
                  jsHeapBytes: performanceMetrics.JSHeapUsedSize,
                });
                await writeFile(output, JSON.stringify({ variant, environment, samples, serverBefore }, null, 2));
              } finally {
                await page.close();
              }
            }
          } finally {
            await context.close();
          }
        }
      }
    }
    const serverAfter = await (await fetch(`${baseUrl}/__profile/stats`)).json();
    await writeFile(output, JSON.stringify({ variant, environment, samples, serverBefore, serverAfter }, null, 2));
  } finally {
    await browser.close();
  }
}

async function compare(directory, summaryPath) {
  const variants = await Promise.all(['SmallestSize', 'Optimal'].map(async (name) => ({
    name,
    output: JSON.parse(await readFile(`${directory}/${name}/files.json`, 'utf8')),
    image: JSON.parse(await readFile(`${directory}/${name}/image.json`, 'utf8')),
    browser: JSON.parse(await readFile(`${directory}/${name}/browser.json`, 'utf8')),
    timings: JSON.parse(await readFile(`${directory}/${name}/output.json`, 'utf8')),
    tasks: JSON.parse(await readFile(`${directory}/${name}/tasks.json`, 'utf8')),
    resources: await readFile(`${directory}/${name}/resources.txt`, 'utf8'),
  })));
  const [baseline, candidate] = variants;
  if (JSON.stringify(baseline.image.baseLayers) !== JSON.stringify(candidate.image.baseLayers)) {
    throw new Error('Container base layers changed between variants.');
  }
  if (baseline.output.pages.some((page, index) =>
    page.sha256 !== candidate.output.pages[index]?.sha256)) {
    throw new Error('Representative pages changed between variants.');
  }
  const browser = baseline.browser.samples.filter(({ trial }) => trial === 0).map((key) => {
    const select = (variant) => variant.browser.samples.filter((sample) =>
      sample.page === key.page && sample.scenario === key.scenario && sample.cache === key.cache);
    return {
      page: key.page, scenario: key.scenario, cache: key.cache,
      variants: variants.map((variant) => {
        const samples = select(variant);
        return {
          name: variant.name, samples: samples.length,
          metrics: Object.fromEntries([
            'ttfbMs', 'downloadMs', 'domContentLoadedMs', 'loadMs', 'fcpMs', 'lcpMs',
            'documentEncodedBytes', 'documentDecodedBytes', 'transferBytes', 'mainThreadTaskMs',
            'scriptMs', 'layoutMs', 'jsHeapBytes',
          ].map((metric) => {
            const values = samples.map((sample) => sample[metric]).filter((value) => value !== null);
            return [metric, values.length ? {
              median: median(values), min: Math.min(...values), max: Math.max(...values),
            } : null];
          })),
        };
      }),
    };
  });
  const deltas = {
    brotliBytes: candidate.output.brotliBytes - baseline.output.brotliBytes,
    publishedBytes: candidate.output.totalBytes - baseline.output.totalBytes,
    archiveBytes: candidate.image.archiveBytes - baseline.image.archiveBytes,
  };
  const model = baseline.output.pages.map((page, index) => ({
    page: page.name,
    extraBytes: candidate.output.pages[index].brotliBytes - page.brotliBytes,
    extraTransferMs: Object.fromEntries([1, 5, 20].map((rate) =>
      [rate, transferPenaltyMs(candidate.output.pages[index].brotliBytes - page.brotliBytes, rate)])),
  }));
  const report = {
    methodology: {
      content: 'One SHA-256-verified generated frontend, same binaries and runner, clean compression outputs per variant.',
      order: ['SmallestSize', 'Optimal'],
      origin: 'Isolated Kestrel using the actual published MapStaticAssets manifest; no Front Door, TLS, Redis or live APIs.',
      browser: 'Chromium; 3 cold/warm pairs per page/scenario; outside-origin requests blocked; 1-second LCP observation after load.',
      mobile: '390x844 viewport, 5 Mbps downstream, 40 ms simulated latency, 4x CPU throttling; not a physical device.',
      cache: 'Browser cache is cold or warm; server filesystem cache is not forcibly evicted.',
      statistics: 'Descriptive medians and ranges; three pairs do not establish statistical significance.',
      transferModel: 'Body-byte delta at 1/5/20 Mbps; excludes RTT, headers and multiplexing.',
    },
    variants, deltas, browser, model,
  };
  await writeFile(`${directory}/comparison.json`, JSON.stringify(report, null, 2));
  const lines = [
    '## Controlled compression comparison', '',
    '| Metric | SmallestSize | Optimal | Delta |',
    '| --- | ---: | ---: | ---: |',
    `| Brotli task seconds | ${baseline.tasks.BrotliCompress.toFixed(3)} | ${candidate.tasks.BrotliCompress.toFixed(3)} | ${(candidate.tasks.BrotliCompress - baseline.tasks.BrotliCompress).toFixed(3)} |`,
    `| Brotli bytes | ${baseline.output.brotliBytes} | ${candidate.output.brotliBytes} | ${deltas.brotliBytes} |`,
    `| Published wwwroot bytes | ${baseline.output.totalBytes} | ${candidate.output.totalBytes} | ${deltas.publishedBytes} |`,
    `| OCI archive bytes | ${baseline.image.archiveBytes} | ${candidate.image.archiveBytes} | ${deltas.archiveBytes} |`,
    '', 'Compression timings and GNU time CPU/RSS measurements:', '',
    ...variants.flatMap((variant) => [`### ${variant.name}`, '```text', ...variant.timings.timings, variant.resources, '```']),
    '', 'Browser response, transfer, FCP/LCP, main-thread, heap, server CPU/RSS, and bandwidth-model data: `comparison.json`.',
    'These are controlled lab measurements, not deployed Front Door or field Core Web Vitals.', '',
  ];
  await appendFile(summaryPath, lines.join('\n'));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'run' && args.length === 4) await run(...args);
  else if (command === 'compare' && args.length === 2) await compare(...args);
  else throw new Error('Usage: profile-static-host-compression.mjs run <url> <manifest> <variant> <output> | compare <directory> <summary>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
