// Stand-in for `astro:content` when the API reference utilities run outside Astro (see astro-hooks.mjs).
//
// Serves the two API data collections of src/frontend/src/content.config.ts from the committed JSON files,
// applying what their schemas do: `package` keeps only its declared keys, the TypeScript arrays default to [].
// Entries carry `id`, `collection`, `data` and `filePath` like glob loader entries, sorted by file name so
// every run enumerates them in the same order. Each collection is parsed once and its entries are shared.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../frontend');

function pick(object, keys) {
  const result = {};
  for (const key of keys) {
    if (object?.[key] !== undefined) result[key] = object[key];
  }
  return result;
}

const collections = {
  packages: {
    dir: 'src/data/pkgs',
    parse(json) {
      return {
        ...json,
        package: pick(json.package, ['name', 'version', 'targetFramework', 'sourceRepository', 'sourceCommit']),
      };
    },
  },
  tsModules: {
    dir: 'src/data/ts-modules',
    parse(json) {
      return {
        ...json,
        package: pick(json.package, ['name', 'version', 'language', 'sourceRepository', 'sourceCommit']),
        functions: json.functions ?? [],
        handleTypes: json.handleTypes ?? [],
        dtoTypes: json.dtoTypes ?? [],
        enumTypes: json.enumTypes ?? [],
      };
    },
  },
};

const loaded = new Map();

function loadCollection(name) {
  let entries = loaded.get(name);
  if (entries) return entries;
  const collection = collections[name];
  if (!collection) throw new Error(`astro:content shim: unknown collection '${name}'`);
  const dir = path.join(frontendRoot, collection.dir);
  entries = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      id: file.slice(0, -'.json'.length),
      collection: name,
      filePath: `${collection.dir}/${file}`,
      data: collection.parse(JSON.parse(readFileSync(path.join(dir, file), 'utf8'))),
    }));
  loaded.set(name, entries);
  return entries;
}

export async function getCollection(name, filter) {
  const entries = loadCollection(name);
  return filter ? entries.filter(filter) : [...entries];
}

export function defineCollection(config) {
  return config;
}
