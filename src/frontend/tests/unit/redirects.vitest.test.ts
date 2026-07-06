import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

import { redirects } from '../../config/redirects.mjs';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const whatsNewDir = path.join(frontendRoot, 'src', 'content', 'docs', 'whats-new');

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
