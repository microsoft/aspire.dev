import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { referenceTopics } from '../../config/sidebar/reference.topics';

const commandsDir = join(process.cwd(), 'src/content/docs/reference/cli/commands');

function collectSlugs(items: unknown, slugs: Set<string>): Set<string> {
  if (!Array.isArray(items)) {
    return slugs;
  }

  for (const item of items) {
    if (typeof item === 'string') {
      slugs.add(item);
    } else if (item && typeof item === 'object') {
      const { slug, items: children } = item as { slug?: unknown; items?: unknown };
      if (typeof slug === 'string') {
        slugs.add(slug);
      }
      collectSlugs(children, slugs);
    }
  }

  return slugs;
}

describe('CLI command reference sidebar', () => {
  it('lists every CLI command page so the page resolves to the Reference topic', () => {
    const slugs = collectSlugs(referenceTopics.items, new Set());
    const missing = readdirSync(commandsDir)
      .filter((file) => /\.mdx?$/.test(file))
      .map((file) => `reference/cli/commands/${file.replace(/\.mdx?$/, '')}`)
      .filter((slug) => !slugs.has(slug));

    expect(missing).toEqual([]);
  });

  it('includes the aspire template source add command', () => {
    const slugs = collectSlugs(referenceTopics.items, new Set());
    expect(slugs.has('reference/cli/commands/aspire-template-source-add')).toBe(true);
  });
});
