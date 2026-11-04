import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';

import { reportApiGenerationFailures } from '../../scripts/report-api-generation-failures.mjs';
import type { ApiGenerationFailure } from '../../scripts/validate-generated-api-data';

const frontend = fileURLToPath(new URL('../..', import.meta.url));
const temporaryDirectories: string[] = [];
const title = 'Integration Data Updater: API generation failures';

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('API failure issue lifecycle', () => {
  function client(issues: { number: number; title: string; state: string; body: string }[] = []) {
    const calls: string[][] = [];
    return {
      calls,
      gh: (args: string[]) => {
        calls.push(args);
        return args[1] === 'list' ? JSON.stringify(issues) : '';
      },
    };
  }

  test('creates an issue with exact diagnostics and does not comment on unchanged failures', () => {
    const first = client();
    reportApiGenerationFailures(
      'C# Foo@2: NU1102 dependency missing',
      'https://example.com/run/1',
      first.gh
    );
    const create = first.calls.find((args) => args[1] === 'create')!;
    const body = create[create.indexOf('--body') + 1];
    expect(body).toContain('NU1102 dependency missing');
    const second = client([{ number: 42, title, state: 'OPEN', body }]);
    reportApiGenerationFailures(
      'C# Foo@2: NU1102 dependency missing',
      'https://example.com/run/2',
      second.gh
    );
    expect(second.calls.map((args) => args[1])).toEqual(['list']);
  });

  test('records changed diagnostics in history without creating another issue', () => {
    const api = client([{ number: 42, title, state: 'OPEN', body: 'old failure' }]);
    reportApiGenerationFailures(
      'TypeScript Foo@2: SDK dump timed out',
      'https://example.com/run/2',
      api.gh
    );
    expect(api.calls.map((args) => args[1])).toEqual(['list', 'edit', 'comment']);
    expect(api.calls[2].at(-1)).toContain('SDK dump timed out');
  });

  test('closes on recovery and reopens the same issue on recurrence', () => {
    const api = client([{ number: 42, title, state: 'OPEN', body: '' }]);
    reportApiGenerationFailures('', 'https://example.com/run/2', api.gh);
    expect(api.calls.map((args) => args[1])).toEqual(['list', 'close']);
    const recurring = client([{ number: 42, title, state: 'CLOSED', body: '' }]);
    reportApiGenerationFailures('C# Foo@2: NU1102', 'https://example.com/run/3', recurring.gh);
    expect(recurring.calls.map((args) => args[1])).toEqual(['list', 'reopen', 'edit', 'comment']);
  });

  test('does not hide GitHub API errors', () => {
    expect(() =>
      reportApiGenerationFailures('failure', 'run', () => {
        throw new Error('GitHub API unavailable');
      })
    ).toThrow('GitHub API unavailable');
  });
});

// Run the real orchestrator and semantic validator in an isolated git repository.
// Only external data collection and package generation are replaced with fixtures.
function fixture(mode: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aspire-updater-test-'));
  temporaryDirectories.push(root);
  const data = path.join(root, 'src', 'frontend', 'src', 'data');
  const scripts = path.join(root, 'src', 'frontend', 'scripts');
  const tool = path.join(root, 'src', 'tools', 'PackageJsonGenerator');
  for (const directory of [
    scripts,
    tool,
    ...['pkgs', 'ts-modules', 'twoslash'].map((name) => path.join(data, name)),
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  for (const name of [
    'update-integration-data.ps1',
    'validate-generated-api-data.ts',
    'supplement-ats-enums.ts',
  ]) {
    fs.copyFileSync(path.join(frontend, 'scripts', name), path.join(scripts, name));
  }
  fs.symlinkSync(
    path.join(frontend, 'node_modules'),
    path.join(root, 'src', 'frontend', 'node_modules'),
    'junction'
  );
  fs.writeFileSync(
    path.join(root, '.gitignore'),
    'node_modules/\noutputs.txt\nintegration-pr-body.md\n'
  );
  fs.writeFileSync(path.join(root, 'src', 'frontend', 'package.json'), '{"type":"module"}');
  const names = ['Aspire.Hosting.Good', 'Aspire.Hosting.Broken'];
  const catalog = names.map((name) => ({
    title: name,
    version: mode === 'retry' ? '2.0.0' : '1.0.0',
  }));
  fs.writeFileSync(path.join(data, 'aspire-integrations.json'), JSON.stringify(catalog));
  fs.writeFileSync(
    path.join(data, 'api-generation-failures.json'),
    mode === 'retry'
      ? JSON.stringify([{ name: names[1], version: '2.0.0', stage: 'C#', reason: 'NU1102' }])
      : '[]'
  );
  for (const name of names) {
    const metadata = {
      name,
      version: '1.0.0',
      sourceRepository: 'https://example.com/source',
      sourceCommit: 'abc',
    };
    fs.writeFileSync(
      path.join(data, 'pkgs', `${name}.1.0.0.json`),
      JSON.stringify({ package: { ...metadata, hasGeneratedExports: true }, types: [] })
    );
    fs.writeFileSync(
      path.join(data, 'ts-modules', `${name}.1.0.0.json`),
      JSON.stringify({ package: metadata, functions: [{}] })
    );
  }
  fs.writeFileSync(path.join(data, 'twoslash', 'aspire.d.ts'), '');
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  };
  git('init', '--quiet');
  git('add', '.');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'Fixture'
  );

  fs.writeFileSync(
    path.join(tool, 'generate-package-json.ps1'),
    `
param([string]$OutputDir)
$catalog = Get-Content "$PSScriptRoot/../../frontend/src/data/aspire-integrations.json" -Raw | ConvertFrom-Json
$failed = @()
foreach ($entry in $catalog) {
    if ($env:FIXTURE_MODE -notin @('retry', 'ts-only-failure', 'clean-bundle-failure') -and $entry.title -ne 'Aspire.Hosting.Good') {
        $failed += $entry.title
        continue
    }
    Get-ChildItem $OutputDir -Filter "$($entry.title).*json" | Remove-Item -Force
    @{ package = @{ name=$entry.title; version=$entry.version; sourceRepository='https://example.com/source'; sourceCommit='abc'; hasGeneratedExports=$true }; types=@() } |
        ConvertTo-Json -Depth 5 | Set-Content (Join-Path $OutputDir "$($entry.title).$($entry.version).json")
}
Write-Host "Done! Success: $($catalog.Count - $failed.Count) | Failed: $($failed.Count) | Skipped: 0"
foreach ($name in $failed) { Write-Host "FAILURE \${name}: error NU1102: Aspire.Hosting >= 17.0.0-preview is unavailable" }
`
  );
  const wrapper = path.join(root, 'run.ps1');
  fs.writeFileSync(
    wrapper,
    `
$ErrorActionPreference = 'Stop'
function global:bun {
    $global:LASTEXITCODE = 0
    $data = Join-Path $PSScriptRoot 'src/frontend/src/data'
    switch ($args[1]) {
        'update:all' {
            if ($env:FIXTURE_MODE -ne 'retry') {
                @(
                    @{ title='Aspire.Hosting.Good'; version='2.0.0' },
                    @{ title='Aspire.Hosting.Broken'; version='2.0.0' },
                    @{ title='Aspire.Hosting.New'; version='2.0.0' }
                ) | ConvertTo-Json | Set-Content (Join-Path $data 'aspire-integrations.json')
            }
        }
        'update:ts-api' {
            if ($env:ASPIRE_TS_API_CARRY_FORWARD -ne '1') { throw 'Carry-forward was not enabled' }
            $failed = 0
            foreach ($file in Get-ChildItem $env:ASPIRE_API_PKGS_DIR -Filter '*.json') {
                $pkg = (Get-Content $file.FullName -Raw | ConvertFrom-Json).package
                if ($env:FIXTURE_MODE -in @('ts-failure', 'ts-only-failure') -and $pkg.name -eq 'Aspire.Hosting.Good') {
                    $failed++
                    continue
                }
                Get-ChildItem $env:ASPIRE_API_TS_MODULES_DIR -Filter "$($pkg.name).*json" | Remove-Item -Force
                @{ package=$pkg; functions=@(@{}) } | ConvertTo-Json -Depth 5 |
                    Set-Content (Join-Path $env:ASPIRE_API_TS_MODULES_DIR "$($pkg.name).$($pkg.version).json")
            }
            Write-Output "Complete: 1 succeeded, $failed failed, 0 skipped"
            if ($failed) { Write-Output 'FAILURE Aspire.Hosting.Good: aspire sdk dump timed out after 3 attempts' }
            New-Item (Split-Path $env:ASPIRE_API_TWOSLASH_FILE) -ItemType Directory -Force | Out-Null
            Set-Content $env:ASPIRE_API_TWOSLASH_FILE ''
            if ($env:FIXTURE_MODE -in @('bundle-failure', 'clean-bundle-failure')) { $global:LASTEXITCODE = 1 }
        }
        'twoslash-types' { Set-Content $env:ASPIRE_API_TWOSLASH_FILE '' }
        'normalize:api-data' {
            if ($env:FIXTURE_MODE -eq 'normalize-failure') { $global:LASTEXITCODE = 1 }
        }
        'validate:api-data' {
            if ($env:FIXTURE_MODE -eq 'validation-failure') {
                Remove-Item (Join-Path $env:ASPIRE_API_TS_MODULES_DIR 'Aspire.Hosting.Good.2.0.0.json')
            }
            & node $env:FIXTURE_TSX (Join-Path $PSScriptRoot 'src/frontend/scripts/validate-generated-api-data.ts')
            $global:LASTEXITCODE = $LASTEXITCODE
        }
    }
}
& "$PSScriptRoot/src/frontend/scripts/update-integration-data.ps1"
exit $LASTEXITCODE
`
  );
  // Keep the mock launcher and generator out of the scope gate's working-tree diff.
  git('add', '.');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'Mocks'
  );
  const output = path.join(root, 'outputs.txt');
  const result = spawnSync('pwsh', ['-NoProfile', '-File', wrapper], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      FIXTURE_MODE: mode,
      GITHUB_ACTIONS: 'true',
      GITHUB_OUTPUT: output,
      RUNNER_TEMP: root,
      FIXTURE_TSX: path.join(frontend, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    },
  });
  return {
    ...result,
    data,
    outputs: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '',
    failures: JSON.parse(
      fs.readFileSync(path.join(data, 'api-generation-failures.json'), 'utf8')
    ) as ApiGenerationFailure[],
  };
}

describe('integration data orchestration', () => {
  test('publishes healthy updates, preserves last-good files, and records missing new packages', () => {
    const run = fixture('partial');
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(fs.existsSync(path.join(run.data, 'pkgs', 'Aspire.Hosting.Good.2.0.0.json'))).toBe(true);
    expect(fs.existsSync(path.join(run.data, 'pkgs', 'Aspire.Hosting.Broken.1.0.0.json'))).toBe(
      true
    );
    expect(run.failures).toHaveLength(2);
    expect(run.failures[0].reason).toContain('NU1102');
    expect(run.outputs).toContain('api_failures_checked<<');
  });

  test('restores a matching C#/TypeScript pair when only the TS generation fails', () => {
    const run = fixture('ts-only-failure');
    expect(run.status, run.stdout + run.stderr).toBe(0);
    for (const directory of ['pkgs', 'ts-modules']) {
      expect(fs.existsSync(path.join(run.data, directory, 'Aspire.Hosting.Good.1.0.0.json'))).toBe(
        true
      );
      expect(fs.existsSync(path.join(run.data, directory, 'Aspire.Hosting.Good.2.0.0.json'))).toBe(
        false
      );
    }
    expect(run.outputs).toContain('aspire sdk dump timed out');
    expect(run.failures).toEqual([
      {
        name: 'Aspire.Hosting.Good',
        version: '2.0.0',
        stage: 'TypeScript',
        reason: 'aspire sdk dump timed out after 3 attempts',
      },
    ]);
  });

  test.each(['normalize-failure', 'bundle-failure', 'validation-failure'])(
    'reports package reasons even when %s blocks publication',
    (mode) => {
      const run = fixture(mode);
      expect(run.status, run.stdout + run.stderr).toBe(1);
      expect(run.outputs).toContain('api_failures_checked<<');
      expect(run.outputs).toContain('NU1102');
      expect(run.outputs).not.toContain('changed<<');
      expect(fs.existsSync(path.join(run.data, 'pkgs', 'Aspire.Hosting.Good.1.0.0.json'))).toBe(
        true
      );
    }
  );

  test('retries persisted failures with no catalog changes and clears them after recovery', () => {
    const run = fixture('retry');
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.failures).toEqual([]);
    expect(run.outputs).toContain('api_failures_checked<<');
    expect(fs.existsSync(path.join(run.data, 'pkgs', 'Aspire.Hosting.Broken.2.0.0.json'))).toBe(
      true
    );
  });

  test('does not close the tracking issue when bundling fails before a complete pass', () => {
    const run = fixture('clean-bundle-failure');
    expect(run.status, run.stdout + run.stderr).toBe(1);
    expect(run.outputs).not.toContain('api_failures_checked<<');
  });
});
