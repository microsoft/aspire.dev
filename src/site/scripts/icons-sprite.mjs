#!/usr/bin/env node
// Builds assets/icons.svg: an SVG sprite with one <symbol id="<icon name>" viewBox="..."> per icon the site renders
// through the `icon` shortcode (templates/shortcodes/icon.liquid) and the partials:
//
// - every Starlight built-in icon (@astrojs/starlight/components-internals/Icons.ts: the UI icons and the `seti:*`
//   file icons used by FileTree and tab icons), ids as Starlight names them (`open-book`, `seti:c-sharp`);
// - the iconify icons the site references (`devicon:*`, `mdi:*`, `material-icon-theme:*`), found in the safelist
//   below (formerly the UnoCSS safelist of src/frontend/uno.config.ts: UnoCSS is not used by src/site),
//   starlight-plugin-icons' cache (.starlight-icons/safelist.json), the sidebar topics, the components, the content
//   and the templates, resolved from the @iconify-json packages;
// - starlight-plugin-icons' own folder icons (`starlight-plugin-icons:folder`, ...).
//
// It also writes:
// - assets/css/icons.css: `.i-<prefix>:<name>` classes (UnoCSS's icon CSS: a mask for monochrome icons, a background
//   for colored ones) for the icons that must stay class based: the safelist and starlight-plugin-icons' safelist
//   (Expressive Code frame icons, `<span class="i-material-icon-theme:csharp code-block-icon">`, and the hub's
//   resource cards). Everything else uses the sprite.
// - scripts/client/generated/file-icons.json: starlight-plugin-icons' file and folder name -> icon tables
//   (.starlight-icons/material-icons.json and language-map.json) pruned to the icons in the sprite, for the
//   client-side file tree (scripts/client/file-tree.ts).
//
// Ids are the icon names verbatim (`<use href="/assets/icons.svg#seti:c-sharp">`). The output is sorted and
// deterministic. Names that cannot be resolved are reported (exit code 0: a missing decorative icon does not fail
// the build; pass --strict to fail).
//
// Usage: node scripts/icons-sprite.mjs [--frontend ../frontend] [--out assets/icons.svg] [--strict]
// Run from src/site (paths are relative to the script's folder otherwise). Node modules are resolved from
// src/site/node_modules when present, else from the frontend's (src/frontend/node_modules) until M8.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const frontendDir = path.resolve(siteDir, argValue('--frontend', '../frontend'));
const outFile = path.resolve(siteDir, argValue('--out', 'assets/icons.svg'));
const strict = args.includes('--strict');

// Resolve packages from src/site first, then from the frontend.
const requireFrom = [path.join(siteDir, 'package.json'), path.join(frontendDir, 'package.json')]
  .filter((p) => existsSync(p))
  .map((p) => createRequire(p));
function resolvePackageDir(name) {
  for (const req of requireFrom) {
    try {
      return path.dirname(req.resolve(`${name}/package.json`));
    } catch {
      // try the next one
    }
  }
  // Packages without an exported package.json: look for the folder directly.
  for (const base of [siteDir, frontendDir]) {
    const dir = path.join(base, 'node_modules', name);
    if (existsSync(dir)) return dir;
  }
  return null;
}

// --- Starlight built-in icons -------------------------------------------------------------------------------------

/** Evaluates `export const <name> = { ... };` object literals of a TypeScript file that only holds string values. */
function readObjectLiteral(file, exportName) {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf(`export const ${exportName}`);
  if (start < 0) throw new Error(`${exportName} not found in ${file}`);
  const open = text.indexOf('{', start);
  const close = text.indexOf('\n};', open);
  const literal = text.slice(open, close + 2);
  return Function(`"use strict"; return (${literal});`)();
}

const starlightDir = resolvePackageDir('@astrojs/starlight');
if (!starlightDir) throw new Error('@astrojs/starlight not found');
const builtIn = readObjectLiteral(path.join(starlightDir, 'components-internals/Icons.ts'), 'BuiltInIcons');
const fileIcons = readObjectLiteral(path.join(starlightDir, 'user-components/file-tree-icons.ts'), 'FileIcons');

/** @type {Map<string, { viewBox: string, body: string }>} */
const symbols = new Map();
for (const [name, body] of Object.entries({ ...builtIn, ...fileIcons })) {
  symbols.set(name, { viewBox: '0 0 24 24', body });
}

// --- iconify icons the site references ----------------------------------------------------------------------------

const iconifyPrefixes = ['devicon', 'mdi', 'material-icon-theme'];
const referenced = new Set();
const namePattern = new RegExp(`(?:^|[^a-z0-9-])(?:i-)?((?:${iconifyPrefixes.join('|')}|starlight-plugin-icons):[a-z0-9]+(?:-[a-z0-9]+)*)`, 'g');

function scanText(text) {
  for (const match of text.matchAll(namePattern)) referenced.add(match[1]);
}

function walk(dir, extensions, visit) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, extensions, visit);
    else if (extensions.some((ext) => entry.endsWith(ext))) visit(full);
  }
}

const textExtensions = ['.astro', '.ts', '.mts', '.mjs', '.mdx', '.md', '.json', '.liquid', '.yml', '.html'];
for (const dir of [
  path.join(frontendDir, 'src/components'),
  path.join(frontendDir, 'src/content/docs'),
  path.join(frontendDir, 'config'),
  path.join(siteDir, 'templates'),
  path.join(siteDir, 'content'),
  path.join(siteDir, 'data/sidebars'),
]) {
  walk(dir, textExtensions, (file) => scanText(readFileSync(file, 'utf8')));
}
// The class-based icons (src/frontend/uno.config.ts's safelist, kept here since UnoCSS is gone).
const classSafelist = [
  'i-devicon:csharp', 'i-devicon:typescript', 'i-devicon:python', 'i-devicon:go-wordmark', 'i-devicon:java',
  'i-mdi:book-open-page-variant-outline', 'i-mdi:rocket-launch-outline', 'i-mdi:pencil-outline', 'i-mdi:laptop',
  'i-mdi:puzzle-outline', 'i-mdi:alert-outline', 'i-mdi:notebook-outline', 'i-mdi:youtube', 'i-mdi:twitch',
  'i-mdi:file-document-outline', 'i-mdi:cog-outline', 'i-mdi:console-line', 'i-mdi:docker', 'i-mdi:file-outline',
  'i-mdi:open-in-new', 'i-mdi:page-first', 'i-mdi:page-last', 'i-mdi:sort-calendar-ascending',
  'i-mdi:sort-calendar-descending', 'i-mdi:sort-alphabetical-ascending', 'i-mdi:sort-alphabetical-descending',
];
scanText(classSafelist.join('\n'));
const classIcons = new Set(classSafelist.map((c) => c.slice(2)));
for (const file of [
  path.join(siteDir, '.starlight-icons/safelist.json'),
  path.join(frontendDir, '.starlight-icons/safelist.json'),
]) {
  if (existsSync(file)) scanText(readFileSync(file, 'utf8'));
}

const iconSets = new Map();
function iconSet(prefix) {
  if (!iconSets.has(prefix)) {
    const dir = resolvePackageDir(`@iconify-json/${prefix}`);
    iconSets.set(prefix, dir ? JSON.parse(readFileSync(path.join(dir, 'icons.json'), 'utf8')) : null);
  }
  return iconSets.get(prefix);
}

function resolveIconify(prefix, name, depth = 0) {
  const set = iconSet(prefix);
  if (!set || depth > 4) return null;
  const icon = set.icons[name];
  if (icon) {
    const left = icon.left ?? set.left ?? 0;
    const top = icon.top ?? set.top ?? 0;
    const width = icon.width ?? set.width ?? 16;
    const height = icon.height ?? set.height ?? 16;
    return { viewBox: `${left} ${top} ${width} ${height}`, body: icon.body };
  }
  const alias = set.aliases?.[name];
  if (alias) {
    if (alias.rotate || alias.hFlip || alias.vFlip) {
      console.warn(`icons-sprite: ${prefix}:${name} is a transformed alias of ${alias.parent}; the transform is ignored`);
    }
    return resolveIconify(prefix, alias.parent, depth + 1);
  }
  return null;
}

const pluginIconsDir = resolvePackageDir('starlight-plugin-icons');
function resolvePluginIcon(name) {
  if (!pluginIconsDir) return null;
  const file = path.join(pluginIconsDir, 'src/assets', `${name}.svg`);
  if (!existsSync(file)) return null;
  const svg = readFileSync(file, 'utf8');
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 24 24';
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return { viewBox, body };
}

const missing = [];
for (const full of [...referenced].sort()) {
  if (symbols.has(full)) continue;
  const [prefix, name] = full.split(':');
  const resolved = prefix === 'starlight-plugin-icons' ? resolvePluginIcon(name) : resolveIconify(prefix, name);
  if (resolved) symbols.set(full, resolved);
  else missing.push(full);
}

// --- write ----------------------------------------------------------------------------------------------------------

const escapeAttr = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const lines = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none">'];
for (const name of [...symbols.keys()].sort()) {
  const { viewBox, body } = symbols.get(name);
  lines.push(`<symbol id="${escapeAttr(name)}" viewBox="${viewBox}">${body}</symbol>`);
}
lines.push('</svg>', '');
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join('\n'));

// --- icons.css: the class-based icons -------------------------------------------------------------------------------

for (const file of [path.join(siteDir, '.starlight-icons/safelist.json'), path.join(frontendDir, '.starlight-icons/safelist.json')]) {
  if (existsSync(file)) {
    for (const cls of JSON.parse(readFileSync(file, 'utf8'))) classIcons.add(String(cls).replace(/^i-/, ''));
    break;
  }
}
const cssEscape = (value) => value.replace(/[:.]/g, (c) => `\\${c}`);
const cssLines = [
  '/* Generated by scripts/icons-sprite.mjs: the class-based icons (UnoCSS icon classes, without UnoCSS). Do not edit. */',
];
for (const name of [...classIcons].sort()) {
  const icon = symbols.get(name);
  if (!icon) continue;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" width="1em" height="1em">${icon.body}</svg>`;
  const uri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/')}")`;
  const common = 'display:inline-block;vertical-align:middle;width:1em;height:1em';
  const rule = icon.body.includes('currentColor')
    ? `--un-icon:${uri};-webkit-mask:var(--un-icon) no-repeat;mask:var(--un-icon) no-repeat;-webkit-mask-size:100% 100%;mask-size:100% 100%;background-color:currentColor;color:inherit;${common}`
    : `background:${uri} no-repeat;background-size:100% 100%;background-color:transparent;${common}`;
  cssLines.push(`.i-${cssEscape(name)}{${rule}}`);
}
const cssFile = path.join(siteDir, 'assets/css/icons.css');
writeFileSync(cssFile, cssLines.join('\n') + '\n');
console.log(`icons-sprite: ${cssLines.length - 1} icon classes -> ${path.relative(process.cwd(), cssFile)}`);

// --- file tree tables -------------------------------------------------------------------------------------------------

const iconCache = [path.join(siteDir, '.starlight-icons'), path.join(frontendDir, '.starlight-icons')].find((dir) =>
  existsSync(path.join(dir, 'material-icons.json'))
);
if (iconCache) {
  const materialIcons = JSON.parse(readFileSync(path.join(iconCache, 'material-icons.json'), 'utf8'));
  const languageMap = JSON.parse(readFileSync(path.join(iconCache, 'language-map.json'), 'utf8'));
  // An entry is kept when its icon is in the sprite (names use '-' where the theme uses '_').
  const inSprite = (icon) => icon && materialIcons.iconDefinitions[icon] && symbols.has(`material-icon-theme:${icon.replace(/_/g, '-')}`);
  const prune = (table) => {
    const result = {};
    for (const key of Object.keys(table ?? {}).sort()) if (inSprite(table[key])) result[key] = table[key].replace(/_/g, '-');
    return result;
  };
  const tables = {
    fileNames: prune(materialIcons.fileNames),
    fileExtensions: prune(materialIcons.fileExtensions),
    languageExtensions: prune(languageMap.fileExtensions),
    folderNames: prune(materialIcons.folderNames),
    folderNamesExpanded: prune(materialIcons.folderNamesExpanded),
  };
  const tablesFile = path.join(siteDir, 'scripts/client/generated/file-icons.json');
  mkdirSync(path.dirname(tablesFile), { recursive: true });
  writeFileSync(tablesFile, JSON.stringify(tables) + '\n');
  console.log(`icons-sprite: file tree tables -> ${path.relative(process.cwd(), tablesFile)}`);
}

const size = Buffer.byteLength(lines.join('\n'));
console.log(`icons-sprite: ${symbols.size} icons, ${(size / 1024).toFixed(0)} KB -> ${path.relative(process.cwd(), outFile)}`);
if (missing.length > 0) {
  console.warn(`icons-sprite: ${missing.length} referenced icon(s) not found: ${missing.join(', ')}`);
  if (strict) process.exitCode = 1;
}
