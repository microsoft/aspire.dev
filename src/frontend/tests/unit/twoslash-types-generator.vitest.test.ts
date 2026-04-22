import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const generatorScript = path.join(frontendRoot, 'scripts', 'generate-twoslash-types.ts');
const outputFile = path.join(frontendRoot, 'src', 'data', 'twoslash', 'aspire.d.ts');

let output = '';

beforeAll(() => {
  // The output is source-controlled, so don't unlink it. Re-run the generator
  // in place; subsequent assertions read the refreshed content.
  // Invoke tsx directly via node to avoid cross-platform `pnpm`/`pnpm.cmd`
  // resolution issues (and the DEP0190 warning from `shell: true`).
  const tsxBin = path.join(frontendRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  execFileSync(process.execPath, [tsxBin, generatorScript], { cwd: frontendRoot, stdio: 'pipe' });
  output = readFileSync(outputFile, 'utf8');
}, 60_000);

describe('generate-twoslash-types', () => {
  test('writes aspire.d.ts to disk', () => {
    expect(existsSync(outputFile)).toBe(true);
    expect(statSync(outputFile).size).toBeGreaterThan(10_000);
  });

  test('emits createBuilder entry point', () => {
    expect(output).toMatch(/export declare function createBuilder\b/);
  });

  test('emits IDistributedApplicationBuilder with addPostgres', () => {
    expect(output).toMatch(/interface IDistributedApplicationBuilder\b/);
    expect(output).toMatch(/addPostgres\s*\(/);
  });

  test('threads class inheritance from pkgs/*.json into extends clauses', () => {
    // ViteAppResource extends JavaScriptAppResource extends ExecutableResource — the
    // generator should follow that chain so withReference/publishAsDockerFile resolve.
    expect(output).toMatch(/interface ViteAppResource[^{]*extends[^{]*ExecutableResource/);
  });

  test('camelCases C# property names', () => {
    // PasswordParameter on RedisResource → passwordParameter (in declaration position;
    // JSDoc comments preserve the original C# casing intentionally).
    expect(output).toMatch(/^\s*passwordParameter:/m);
    expect(output).not.toMatch(/^\s*PasswordParameter:/m);
  });

  test('emits an options-object overload for primitive-only param lists', () => {
    // withDataVolume(options?: { ... }) is the canonical shape produced when all
    // params are primitives — generator pairs it with a positional overload.
    expect(output).toMatch(/withDataVolume\(options\?: \{/);
  });
});
