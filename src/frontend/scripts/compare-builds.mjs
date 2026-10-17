import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** @param {string} directory */
export async function buildManifest(directory) {
  /** @type {Record<string, string>} */
  const manifest = Object.create(null);
  async function visit(relative = '') {
    for (const entry of (await readdir(join(directory, relative), { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name, 'en')
    )) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) {
        manifest[name] = createHash('sha256')
          .update(await readFile(join(directory, name)))
          .digest('hex');
      } else {
        throw new Error(`Unsupported output entry: ${name}`);
      }
    }
  }
  await visit();
  if (!Object.keys(manifest).length) throw new Error(`Build output is empty: ${directory}`);
  return manifest;
}

/**
 * @param {Record<string, string>} expected
 * @param {Record<string, string>} actual
 */
export function compareManifests(expected, actual) {
  const missing = Object.keys(expected).filter((name) => !Object.hasOwn(actual, name));
  const extra = Object.keys(actual).filter((name) => !Object.hasOwn(expected, name));
  const changed = Object.keys(expected).filter(
    (name) => Object.hasOwn(actual, name) && expected[name] !== actual[name]
  );
  return { missing, extra, changed };
}

if (import.meta.main) {
  const [command, directory, manifestPath, ...rest] = process.argv.slice(2);
  if (!['snapshot', 'compare'].includes(command) || !directory || !manifestPath || rest.length) {
    throw new Error(
      'Usage: node scripts/compare-builds.mjs <snapshot|compare> <output> <manifest.json>'
    );
  }
  const manifest = await buildManifest(directory);
  if (command === 'snapshot') {
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Recorded ${Object.keys(manifest).length} complete-output file hashes.`);
  } else {
    const expected = JSON.parse(await readFile(manifestPath, 'utf8'));
    const differences = compareManifests(expected, manifest);
    for (const [kind, paths] of Object.entries(differences)) {
      console.log(`${kind}: ${paths.length}`);
      for (const path of paths.slice(0, 50)) console.log(`  ${path}`);
    }
    if (Object.values(differences).some((paths) => paths.length > 0)) {
      throw new Error(
        'Clean/incremental output differs. No files or metadata were normalized away.'
      );
    }
    console.log(`All ${Object.keys(manifest).length} files are byte-equivalent.`);
  }
}
