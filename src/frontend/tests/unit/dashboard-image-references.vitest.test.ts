import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import samples from '@data/samples.json';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(testsDir, '..', '..', 'src', 'content', 'docs');
const stableImage = 'mcr.microsoft.com/aspire/dashboard:latest';
const nightlyImage = 'mcr.microsoft.com/aspire/nightly/dashboard:latest';

function readDoc(file: string): string {
  return readFileSync(path.join(docsRoot, file), 'utf8');
}

function dockerCommands(source: string): string[] {
  return [...source.matchAll(/```(?:bash|powershell)[^\n]*\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .filter((code) => code.startsWith('docker run '));
}

describe('standalone dashboard container images', () => {
  test.each([
    ['dashboard/standalone.mdx', 2],
    ['dashboard/index.mdx', 2],
    ['dashboard/configuration.mdx', 2],
    ['dashboard/enable-browser-telemetry/index.mdx', 4],
  ])('%s uses the stable image in both shell variants', (file, count) => {
    const source = readDoc(file);
    const commands = dockerCommands(source);

    expect(commands).toHaveLength(count);
    expect(source.match(/<OsAwareTabs syncKey="terminal">/g)?.length).toBeGreaterThanOrEqual(
      count / 2
    );
    for (const command of commands) {
      expect(command.match(/mcr\.microsoft\.com\/\S+/g)).toEqual([stableImage]);
      expect(command).toContain('--name aspire-dashboard');
      for (const port of ['18888:18888', '4317:18889', '4318:18890']) {
        expect(command).toContain(`-p ${port}`);
      }
    }
    expect(source.match(/```bash\b/g)?.length).toBeGreaterThanOrEqual(count / 2);
    expect(source.match(/```powershell\b/g)?.length).toBeGreaterThanOrEqual(count / 2);
  });

  test('preserves telemetry limits and CORS settings', () => {
    for (const command of dockerCommands(readDoc('dashboard/configuration.mdx'))) {
      for (const setting of ['MAXLOGCOUNT', 'MAXTRACECOUNT', 'MAXMETRICSCOUNT']) {
        expect(command).toContain(`-e DASHBOARD__TELEMETRYLIMITS__${setting}='1000'`);
      }
    }
    const browserCommands = dockerCommands(readDoc('dashboard/enable-browser-telemetry/index.mdx'));
    expect(
      browserCommands.filter((command) =>
        command.includes('-e DASHBOARD__OTLP__CORS__ALLOWEDORIGINS=https://localhost:8080')
      )
    ).toHaveLength(2);
  });

  test('keeps the command explanation and container log name consistent', () => {
    const source = readDoc('dashboard/standalone.mdx');
    expect(source).toContain(`Starts a container from the \`${stableImage}\` image.`);
    expect(source).toContain('docker container logs aspire-dashboard');
    expect(source).toContain('aspire dashboard run');
  });
});

describe('deployment example dashboard image references', () => {
  test.each(['get-started/deploy-first-app.mdx', 'ja/get-started/deploy-first-app.mdx'])(
    '%s selects the canonical floating nightly image',
    (file) => {
      // The examples intentionally select nightly latest, not a publisher default.
      const images = [...readDoc(file).matchAll(/image: "(mcr\.microsoft\.com\/[^"]+)"/g)].map(
        (match) => match[1]
      );
      expect(images).toEqual([nightlyImage, nightlyImage]);
    }
  );
});

describe('standalone dashboard sample image', () => {
  test('uses the same stable image in the command and explanation in both README fields', () => {
    const sample = samples.find((entry) => entry.name === 'standalone-dashboard');
    expect(sample).toBeDefined();
    for (const field of ['readme', 'readmeRaw'] as const) {
      const source = sample![field];
      const images = source.match(/mcr\.microsoft\.com\/[^\s`]+/g);
      expect(images).toEqual([stableImage, stableImage]);
      expect(source).toContain(`--name aspire-dashboard ${stableImage}`);
    }
  });
});
