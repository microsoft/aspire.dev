import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { appHostLanguageConfig } from '../../src/utils/apphost-languages';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(testsDirectory, '..', '..');
const fixtureDirectory = path.join(
  frontendDirectory,
  'tests',
  'fixtures',
  'apphost-languages'
);
const castDirectory = path.join(frontendDirectory, 'public', 'casts');
const imageDirectory = path.join(frontendDirectory, 'src', 'assets', 'get-started');

const fixtureNames = {
  typescript: 'apphost.mts',
  csharp: 'apphost.cs',
  python: 'apphost.py',
  go: 'apphost.go',
  java: 'AppHost.java',
  rust: 'apphost.rs',
} as const;

describe('AppHost language runtime evidence', () => {
  test('ships a source fixture, terminal cast, and dashboard image for every language', () => {
    for (const language of appHostLanguageConfig.languages) {
      const sourcePath = path.join(
        fixtureDirectory,
        language.id,
        fixtureNames[language.id]
      );
      const castPath = path.join(castDirectory, `apphost-${language.id}.cast`);
      const imagePath = path.join(
        imageDirectory,
        `apphost-${language.id}-dashboard.png`
      );

      expect(fs.statSync(sourcePath).size, sourcePath).toBeGreaterThan(100);
      expect(fs.statSync(castPath).size, castPath).toBeGreaterThan(1_000);
      expect(fs.statSync(imagePath).size, imagePath).toBeGreaterThan(10_000);

      const pngHeader = fs.readFileSync(imagePath).subarray(0, 8);
      expect([...pngHeader], imagePath).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
  });

  test('casts contain verified lifecycle output without tokens or machine paths', () => {
    for (const language of appHostLanguageConfig.languages) {
      const castPath = path.join(castDirectory, `apphost-${language.id}.cast`);
      const cast = fs.readFileSync(castPath, 'utf8');

      expect(cast, castPath).toContain('$ aspire start --isolated');
      expect(cast, castPath).toContain('$ aspire describe --format Table');
      expect(cast, castPath).toContain('Running');
      expect(cast, castPath).toContain('Healthy');
      expect(cast, castPath).toContain('HTTP/200');
      expect(cast, castPath).toContain('stopped and cleaned up.');
      expect(cast, castPath).not.toMatch(
        new RegExp(String.raw`login\?t=|C:\\\\Users|/home/dapine|0b64c4e8`)
      );
    }
  });

  test('keeps the Rust runtime limitation explicit in its fixture and recording', () => {
    const rustSource = fs.readFileSync(
      path.join(fixtureDirectory, 'rust', 'apphost.rs'),
      'utf8'
    );
    const rustCast = fs.readFileSync(
      path.join(castDirectory, 'apphost-rust.cast'),
      'utf8'
    );

    expect(rustSource).toContain('add_external_service');
    expect(rustCast).toContain('ExternalService');
    expect(rustCast).toContain('External service reachable.');
  });
});
