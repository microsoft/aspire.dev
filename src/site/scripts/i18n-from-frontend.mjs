// Builds src/site/data/i18n/<locale>.json (i18n.<locale> in templates, read by the `t` filter) from:
//   1. Starlight's built-in UI strings (@astrojs/starlight/translations/<lang>.json, flat dotted keys),
//   2. the plugins' strings that Starlight merged into the same dictionary:
//      starlight-page-actions (namespaced here under `pageActions.`, see below) and starlight-kbd (`starlightKbd.`),
//   3. the site's strings (src/frontend/src/content/i18n/<lang>.json, nested), which win.
// Flat keys are nested on `.` (`search.label` -> { search: { label } }), so templates write {{ "search.label" | t }}.
//
// A key that is both a leaf and a prefix of other keys cannot be nested: its value moves to `<key>.label`.
// Today that only happens in starlight-page-actions (`open` / `open.chatgpt`, `share` / `share.x`), which is also
// why its keys are namespaced: `open` -> `pageActions.open.label`, `open.chatgpt` -> `pageActions.open.chatgpt`,
// `prompt.default` -> `pageActions.prompt.default`.
//
// One-shot while src/frontend exists; after the cutover the JSON files are hand maintained.
// Run from the repository root:  node src/site/scripts/i18n-from-frontend.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const frontend = resolve(site, '../frontend');
const nm = join(frontend, 'node_modules');
const outDir = join(site, 'data/i18n');

// Our locale keys (douze.yml site.locales; `en` is the root locale) -> the language tag used by the sources.
const locales = {
  en: 'en', de: 'de', es: 'es', ja: 'ja', fr: 'fr', it: 'it', id: 'id', 'zh-cn': 'zh-CN',
  'pt-br': 'pt-BR', ko: 'ko', tr: 'tr', ru: 'ru', hi: 'hi', da: 'da', uk: 'uk',
};

// Starlight names some files by language only.
const starlightFile = { 'pt-BR': 'pt', 'zh-CN': 'zh-CN' };

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// The plugin dictionaries are TypeScript object literals of plain strings: evaluate them without a TS loader by
// stripping the `export const X =` prefix.
function readTsObject(path) {
  const src = readFileSync(path, 'utf8').replace(/^\s*export\s+const\s+\w+\s*=\s*/m, 'return ');
  return new Function(src)();
}

const conflicts = [];

function nest(flat, prefix = '') {
  const keys = Object.keys(flat);
  const prefixes = new Set();
  for (const k of keys) {
    const parts = k.split('.');
    for (let i = 1; i < parts.length; i++) prefixes.add(parts.slice(0, i).join('.'));
  }
  const out = {};
  for (const k of keys) {
    let path = k;
    if (prefixes.has(k)) {
      conflicts.push(`${prefix}${k} -> ${prefix}${k}.label`);
      path = `${k}.label`;
    }
    const parts = (prefix + path).split('.');
    let node = out;
    for (const p of parts.slice(0, -1)) node = node[p] ??= {};
    node[parts.at(-1)] = flat[k];
  }
  return out;
}

function deepMerge(target, source, path = '') {
  for (const [k, v] of Object.entries(source)) {
    const t = target[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (t !== undefined && (typeof t !== 'object' || t === null)) {
        conflicts.push(`${path}${k}: a string in a lower source is replaced by an object`);
        target[k] = {};
      }
      target[k] ??= {};
      deepMerge(target[k], v, `${path}${k}.`);
    } else {
      if (t && typeof t === 'object') conflicts.push(`${path}${k}: an object in a lower source is replaced by a string`);
      target[k] = v;
    }
  }
  return target;
}

const pageActions = readTsObject(join(nm, 'starlight-page-actions/i18n/translations.ts'));
const kbd = readTsObject(join(nm, 'starlight-kbd/translations.ts'));

mkdirSync(outDir, { recursive: true });
for (const [key, lang] of Object.entries(locales)) {
  const result = {};
  const base = lang.split('-')[0];

  const slPath = join(nm, '@astrojs/starlight/translations', `${starlightFile[lang] ?? lang}.json`);
  if (existsSync(slPath)) deepMerge(result, nest(readJson(slPath)));
  else console.warn(`no Starlight strings for ${lang}`);

  const pa = pageActions[lang] ?? pageActions[base];
  if (pa) deepMerge(result, nest(pa, 'pageActions.'));
  const kb = kbd[lang] ?? kbd[base];
  if (kb) deepMerge(result, nest(kb));

  const sitePath = join(frontend, 'src/content/i18n', `${lang}.json`);
  if (existsSync(sitePath)) deepMerge(result, readJson(sitePath));
  else console.warn(`no site strings for ${lang}`);

  writeFileSync(join(outDir, `${key}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(`wrote data/i18n/${key}.json`);
}

for (const c of [...new Set(conflicts)]) console.log(`conflict: ${c}`);
