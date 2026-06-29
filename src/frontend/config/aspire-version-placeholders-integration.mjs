import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceAspireVersionPlaceholders } from './remark-aspire-version-placeholders.mjs';

const generatedAssetExtensions = new Set(['.html', '.md', '.txt']);

export function aspireVersionPlaceholdersIntegration() {
  return {
    name: 'aspire-version-placeholders',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        await replaceAspireVersionPlaceholdersInDirectory(fileURLToPath(dir));
      },
    },
  };
}

export async function replaceAspireVersionPlaceholdersInDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const resolvedPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await replaceAspireVersionPlaceholdersInDirectory(resolvedPath);
        return;
      }

      if (!entry.isFile() || !generatedAssetExtensions.has(path.extname(entry.name))) {
        return;
      }

      const content = await readFile(resolvedPath, 'utf8');
      const updated = replaceAspireVersionPlaceholders(content);

      if (updated !== content) {
        await writeFile(resolvedPath, updated);
      }
    })
  );
}
