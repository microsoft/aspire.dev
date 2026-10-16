import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import samples from '@data/samples.json';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(testsDir, '..', '..', 'src', 'content', 'docs');
const stableImage = 'mcr.microsoft.com/aspire/dashboard:latest';
const nightlyImage = 'mcr.microsoft.com/aspire/nightly/dashboard:latest';
const versionedNightlyImage = 'mcr.microsoft.com/aspire/nightly/dashboard:13.6';

function readDoc(file: string): string {
  return readFileSync(path.join(docsRoot, file), 'utf8');
}

function dockerCommands(source: string): string[] {
  return [...source.matchAll(/```(?:bash|powershell)[^\n]*\n([\s\S]*?)```/g)].flatMap(
    (match) => match[1].match(/^docker run[^\n]*(?:\n[ \t]+[^\n]*)*/gm) ?? []
  );
}

function legacyImageReferences(source: string): string[] {
  return (
    source.match(
      /mcr\.microsoft\.com\/dotnet\/(?:nightly\/)?aspire-dashboard:\w[\w.-]{0,127}(?=$|[\s`"'@])/g
    ) ?? []
  );
}

describe('standalone dashboard container images', () => {
  test.each([
    ['dashboard/standalone.mdx', 4],
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

  test('preserves the volume and persistence settings in both shell variants', () => {
    const commands = dockerCommands(readDoc('dashboard/standalone.mdx')).filter((command) =>
      command.includes('--mount')
    );
    expect(commands).toHaveLength(2);
    for (const command of commands) {
      expect(command).toContain(
        '--mount type=volume,source=aspire-dashboard-data,target=/home/app'
      );
      expect(command).toContain('-e ASPIRE_DASHBOARD_APPLICATION_NAME=my-app');
      expect(command).toContain('-e ASPIRE_DASHBOARD_DATA_DIRECTORY=/home/app/dashboard-data');
      expect(command).toContain('-e ASPIRE_DASHBOARD_PERSISTENCE_MODE=run');
    }
  });

  test.each([
    'latest',
    '13',
    '13.6',
    '13.5',
    '14.0',
    '13.6.1',
    '13.6.1-amd64',
    'preview_1',
    'Preview.1',
    '_build',
    'a'.repeat(128),
  ])('detects the legacy Docker tag %s in both channels', (tag) => {
    for (const repository of ['dotnet/aspire-dashboard', 'dotnet/nightly/aspire-dashboard']) {
      const image = `mcr.microsoft.com/${repository}:${tag}`;
      expect(legacyImageReferences(`image: "${image}"`)).toEqual([image]);
      expect(legacyImageReferences(image)).toEqual([image]);
      expect(legacyImageReferences(`${image}@sha256:${'a'.repeat(64)}`)).toEqual([image]);
    }
  });

  test('uses canonical tagged image references throughout active docs in all locales', () => {
    const legacyImages: string[] = [];
    for (const file of readdirSync(docsRoot, { recursive: true, encoding: 'utf8' })) {
      if (!/\.mdx?$/.test(file) || /(?:^|[\\/])whats-new[\\/]aspire-\d/.test(file)) {
        continue;
      }
      const images = legacyImageReferences(readDoc(file));
      legacyImages.push(...images.map((image) => `${file}: ${image}`));
    }
    expect(legacyImages).toEqual([]);
  });
});

describe('deployment example dashboard image references', () => {
  test.each([
    ['get-started/deploy-first-app.mdx', nightlyImage],
    ['ja/get-started/deploy-first-app.mdx', versionedNightlyImage],
  ])('%s preserves its documented nightly image selection', (file, image) => {
    const images = [...readDoc(file).matchAll(/image: "(mcr\.microsoft\.com\/[^"]+)"/g)].map(
      (match) => match[1]
    );
    expect(images).toEqual([image, image]);
  });

  test('distinguishes the English floating examples from installed publisher output', () => {
    const source = readDoc('get-started/deploy-first-app.mdx');
    expect(source).toContain(`intentionally select \`${nightlyImage}\``);
    expect(source).toContain('Your installed Aspire publisher can generate a different repository');
    expect(source).toContain('/dashboard/standalone/#container-image-repositories-and-migration');
  });
});

describe('standalone dashboard sample image', () => {
  test('preserves the upstream nightly version pin in both README fields', () => {
    const sample = samples.find((entry) => entry.name === 'standalone-dashboard');
    expect(sample).toBeDefined();
    for (const field of ['readme', 'readmeRaw'] as const) {
      const source = sample![field];
      const images = source.match(/mcr\.microsoft\.com\/[^\s`]+/g);
      expect(images).toEqual([versionedNightlyImage, versionedNightlyImage]);
      expect(source).toContain(`--name aspire-dashboard ${versionedNightlyImage}`);
      expect(source).toContain(`\`${versionedNightlyImage}\` prerelease image.`);
    }
  });
});
