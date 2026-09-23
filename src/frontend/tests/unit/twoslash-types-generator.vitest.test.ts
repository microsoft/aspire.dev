import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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

  test('preserves optional DTO fields', () => {
    expect(output).toMatch(
      /export interface CertificateTrustExecutionConfigurationContext\s*\{[^}]*\bisContainer\?: boolean;/s
    );
  });

  test('emits an options-object overload for primitive-only param lists', () => {
    // withDataVolume(options?: { ... }) is the canonical shape produced when all
    // params are primitives — generator pairs it with a positional overload.
    expect(output).toMatch(/withDataVolume\(options\?: \{/);
  });

  test('does not wrap an existing options DTO in another options object', () => {
    expect(output).not.toMatch(/options\?: \{\s*options\?:/);
  });

  test('does not infer ContainerResource from marker interfaces', () => {
    expect(output).not.toMatch(
      /export interface \w+[^{]*extends[^{]*(?:ExecutableResource[^{]*ContainerResource|ContainerResource[^{]*ExecutableResource)/
    );
  });

  test('scopes fallback inheritance to the package when full type names collide', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'aspire-twoslash-types-'));
    const packagesDir = path.join(fixtureRoot, 'pkgs');
    const modulesDir = path.join(fixtureRoot, 'ts-modules');
    const fixtureOutput = path.join(fixtureRoot, 'twoslash', 'aspire.d.ts');
    mkdirSync(packagesDir);
    mkdirSync(modulesDir);

    const writeJson = (filePath: string, value: unknown): void => {
      writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
    };
    const collidingFullName = 'Aspire.Hosting.ApplicationModel.K8sManifestResource';

    try {
      writeJson(path.join(packagesDir, 'A.K3s.1.0.0.json'), {
        package: { name: 'A.K3s', version: '1.0.0' },
        types: [
          {
            name: 'K8sManifestResource',
            fullName: collidingFullName,
            kind: 'class',
            baseType: 'Aspire.Hosting.ApplicationModel.ContainerResource',
          },
        ],
      });
      writeJson(path.join(packagesDir, 'B.Kind.1.0.0.json'), {
        package: { name: 'B.Kind', version: '1.0.0' },
        types: [
          {
            name: 'K8sManifestResource',
            fullName: collidingFullName,
            kind: 'class',
            baseType: 'Aspire.Hosting.ApplicationModel.KindDeployedResource',
          },
        ],
      });
      writeJson(path.join(modulesDir, 'A.K3s.1.0.0.json'), {
        package: { name: 'A.K3s', version: '1.0.0' },
        handleTypes: [
          {
            name: 'ContainerResource',
            fullName: 'Aspire.Hosting.ApplicationModel.ContainerResource',
            kind: 'handle',
          },
          {
            name: 'K8sManifestResource',
            fullName: collidingFullName,
            kind: 'handle',
          },
        ],
      });
      writeJson(path.join(modulesDir, 'B.Kind.1.0.0.json'), {
        package: { name: 'B.Kind', version: '1.0.0' },
        handleTypes: [
          {
            name: 'KindDeployedResource',
            fullName: 'Aspire.Hosting.ApplicationModel.KindDeployedResource',
            kind: 'handle',
          },
          {
            name: 'K8sManifestResource',
            fullName: collidingFullName,
            kind: 'handle',
          },
        ],
      });

      const tsxBin = path.join(frontendRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      execFileSync(process.execPath, [tsxBin, generatorScript], {
        cwd: frontendRoot,
        env: {
          ...process.env,
          ASPIRE_API_PKGS_DIR: packagesDir,
          ASPIRE_API_TS_MODULES_DIR: modulesDir,
          ASPIRE_API_TWOSLASH_FILE: fixtureOutput,
        },
        stdio: 'pipe',
      });

      const fixtureDeclarations = readFileSync(fixtureOutput, 'utf8');
      expect(fixtureDeclarations).toMatch(
        /export interface K8sManifestResource extends ContainerResource/
      );
      expect(fixtureDeclarations).not.toMatch(
        /export interface K8sManifestResource extends KindDeployedResource/
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test('prefers generated DTO metadata over post-snapshot shims', () => {
    const declarations = output.match(/export interface ParameterCustomInputOptions\b/g) ?? [];

    expect(declarations).toHaveLength(1);
    expect(output).toMatch(/inputType\?: InputType/);
    expect(output).toMatch(/label\?: string/);
    expect(output).toMatch(/description\?: string/);
    expect(output).toMatch(/enableDescriptionMarkdown\?: boolean/);
    expect(output).toMatch(/options\?: Dict<string,string>/);
    expect(output).toMatch(/value\?: string/);
    expect(output).toMatch(/placeholder\?: string/);
    expect(output).toMatch(/allowCustomChoice\?: boolean/);
    expect(output).toMatch(/disabled\?: boolean/);
    expect(output).toMatch(/maxLength\?: number/);
  });
});
