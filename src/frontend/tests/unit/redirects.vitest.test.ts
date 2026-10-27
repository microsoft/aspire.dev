import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

import { redirects } from '../../config/redirects.mjs';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const docsDir = path.join(frontendRoot, 'src', 'content', 'docs');
const whatsNewDir = path.join(docsDir, 'whats-new');

const versionPattern = /^aspire-(\d+)(?:-(\d+))?\.mdx$/;

function findHighestVersionSlug(): string {
  let bestSlug: string | null = null;
  let bestKey = -1;

  for (const entry of readdirSync(whatsNewDir)) {
    const match = versionPattern.exec(entry);
    if (!match) continue;

    const major = Number(match[1]);
    const minor = Number(match[2] ?? 0);
    const key = major * 1000 + minor;

    if (key > bestKey) {
      bestKey = key;
      bestSlug = entry.replace(/\.mdx$/, '');
    }
  }

  if (!bestSlug) {
    throw new Error(`No versioned whats-new entries found in ${whatsNewDir}`);
  }

  return bestSlug;
}

test('/whats-new/ has a configured redirect', () => {
  expect(redirects).toHaveProperty('/whats-new/');
});

test('/whats-new/ redirect uses 302 (temporary) status', () => {
  const entry = (redirects as Record<string, unknown>)['/whats-new/'];

  expect(entry).toEqual(
    expect.objectContaining({
      status: 302,
      destination: expect.stringMatching(/^\/whats-new\/aspire-[\d-]+\/$/),
    })
  );
});

test('/whats-new/ redirect destination points to the highest-versioned release notes file', () => {
  const entry = (redirects as Record<string, unknown>)['/whats-new/'] as {
    destination: string;
  };
  const expectedSlug = findHighestVersionSlug();

  expect(entry.destination).toBe(`/whats-new/${expectedSlug}/`);
});

test('/whats-new/ redirect destination resolves to a real .mdx file on disk', () => {
  const entry = (redirects as Record<string, unknown>)['/whats-new/'] as {
    destination: string;
  };

  const slug = entry.destination.replace(/^\/whats-new\//, '').replace(/\/$/, '');
  const filePath = path.join(whatsNewDir, `${slug}.mdx`);

  expect(existsSync(filePath), `Expected ${filePath} to exist`).toBe(true);
});

test('host-only integration routes redirect to their get-started pages', () => {
  expect(redirects).toMatchObject({
    '/integrations/frameworks/deno-apps/': '/integrations/frameworks/deno/deno-get-started/',
    '/integrations/frameworks/java/': '/integrations/frameworks/java/java-get-started/',
    '/integrations/frameworks/perl/': '/integrations/frameworks/perl/perl-get-started/',
    '/integrations/frameworks/powershell/':
      '/integrations/frameworks/powershell/powershell-get-started/',
    '/integrations/frameworks/rust/': '/integrations/frameworks/rust/rust-get-started/',
    '/integrations/devtools/k6/': '/integrations/devtools/k6/k6-get-started/',
    '/integrations/devtools/sql-projects/':
      '/integrations/devtools/sql-projects/sql-projects-get-started/',
    '/ja/integrations/frameworks/java/': '/integrations/frameworks/java/java-get-started/',
    '/ja/integrations/frameworks/powershell/':
      '/integrations/frameworks/powershell/powershell-get-started/',
    '/ja/integrations/frameworks/rust/': '/integrations/frameworks/rust/rust-get-started/',
  });
});

// Legacy host-only routes (from the get-started/host split) are retained as
// redirects above for external compatibility, but in-repo docs links should
// point at the canonical `*-get-started` pages so readers don't take an extra
// redirect hop. This guards against reintroducing the redirect-hop links.
const legacyHostOnlyRoutes = new Set(
  [
    '/integrations/frameworks/deno-apps',
    '/integrations/frameworks/java',
    '/integrations/frameworks/perl',
    '/integrations/frameworks/powershell',
    '/integrations/frameworks/rust',
    '/integrations/devtools/k6',
    '/integrations/devtools/sql-projects',
  ].flatMap((route) => [route, `/ja${route}`])
);

function collectDocFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectDocFiles(full));
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      files.push(full);
    }
  }
  return files;
}

function normalizeLinkPath(url: string): string {
  return url
    .split('#')[0]
    .split('?')[0]
    .replace(/\/+$/, '');
}

test('docs do not link to legacy host-only routes (use canonical get-started URLs)', () => {
  // Matches markdown links `](/path)` and JSX `href="/path"` / `href='/path'`.
  const linkPattern = /(?:\]\(|href=["'])(\/[^)"'\s#?]*)/g;
  const offenders: string[] = [];

  for (const file of collectDocFiles(docsDir)) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(linkPattern)) {
        if (legacyHostOnlyRoutes.has(normalizeLinkPath(match[1]))) {
          const rel = path.relative(frontendRoot, file).replace(/\\/g, '/');
          offenders.push(`${rel}:${index + 1} -> ${match[1]}`);
        }
      }
    });
  }

  expect(
    offenders,
    `Repoint these links to the canonical *-get-started page:\n${offenders.join('\n')}`
  ).toEqual([]);
});
