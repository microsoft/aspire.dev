import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const source = readFileSync(
  new URL('../../src/content/docs/reference/cli/commands/aspire-deploy.mdx', import.meta.url),
  'utf8',
);

describe('CLI deployment container prerequisites', () => {
  test('explains that .NET container images are built locally before deployment', () => {
    expect(source).toMatch(/\.NET container build step[^.\n]*locally[^.\n]*`aspire deploy`/);
  });

  test('warns about matching the container runtime OS and switching Docker Desktop mode', () => {
    const caution = source.match(/:::caution\[Match the container OS\]\n([\s\S]*?)\n:::/)?.[1];

    expect(caution).toBeDefined();
    expect(caution).toMatch(/OS mode must match[^.\n]*AppHost/);
    expect(caution).toContain('Linux containers for Linux images');
    expect(caution).toContain('Windows containers for Windows images');
    expect(caution).toContain('Docker Desktop');
    expect(caution).toContain('Switch to Linux containers');
  });
});
