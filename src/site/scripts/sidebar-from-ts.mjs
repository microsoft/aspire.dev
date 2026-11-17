// One-shot conversion of the Astro sidebar (src/frontend/config/sidebar/*.topics.ts) to Douze site data
// (src/site/data/sidebars/<topic>.yml). After the cutover the YAML files are hand maintained and this script is
// only kept to regenerate them while src/frontend still exists.
//
// Run from the repository root (tsx evaluates the TypeScript modules):
//   (cd src/frontend && bunx tsx ../site/scripts/sidebar-from-ts.mjs)
//
// Output shape (also written as a comment at the top of each file):
//   topic:  { label: <English>, translations?: { <lang tag>: <label> }, link, icon, badge?, id?, items }
//   item:   { label, translations?, link?, collapsed?, badge?, attrs?, items? }
//   badge:  "Text" | { text, variant, translations? }
// `slug: x` becomes `link: /x/`; internal links get a leading and a trailing slash; external links are kept.
// The topic order (sidebar.topics.ts) goes to `sidebar_topics` in data/site.yml, which this script does not write:
// it prints the order so it can be checked against site.yml.

import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const frontend = resolve(site, '../frontend');
const sidebarDir = join(frontend, 'config/sidebar');
const outDir = join(site, 'data/sidebars');

const exclude = [
  '**/includes/**/*',
  '/support',
  '/diagnostics/aspireats001',
  '/**/diagnostics/aspireats001',
  '/reference/api',
  '/reference/api/**',
];

function normalizeLink(link) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#')) return link;
  let l = link.trim();
  const hashIndex = l.search(/[?#]/);
  let suffix = '';
  if (hashIndex >= 0) {
    suffix = l.slice(hashIndex);
    l = l.slice(0, hashIndex);
  }
  if (!l.startsWith('/')) l = '/' + l;
  if (!l.endsWith('/')) l += '/';
  return l + suffix;
}

function slugToLink(slug) {
  if (slug === '' || slug === 'index' || slug === '/') return '/';
  return normalizeLink(slug.replace(/\/index$/, ''));
}

function splitLabel(label) {
  if (typeof label === 'string') return { label };
  const { en, ...rest } = label;
  return { label: en ?? Object.values(label)[0], translations: Object.keys(rest).length ? rest : undefined };
}

function dropEnglish(translations, label) {
  if (!translations) return undefined;
  const result = {};
  for (const [k, v] of Object.entries(translations)) {
    if (k === 'en' && v === label) continue;
    result[k] = v;
  }
  return Object.keys(result).length ? result : undefined;
}

function convertBadge(badge) {
  if (badge === undefined) return undefined;
  if (typeof badge === 'string') return badge;
  const out = {};
  if (typeof badge.text === 'string') {
    out.text = badge.text;
  } else if (badge.text) {
    // A translated text map is kept as it is.
    out.text = badge.text;
  }
  if (badge.variant) out.variant = badge.variant;
  if (badge.class) out.class = badge.class;
  const tr = dropEnglish(badge.translations, typeof badge.text === 'string' ? badge.text : undefined);
  if (tr) out.translations = tr;
  return out;
}

function convertItem(item) {
  if (typeof item === 'string') return { link: slugToLink(item) };
  const out = {};
  const { label, translations } = splitLabel(item.label);
  if (label !== undefined) out.label = label;
  const tr = dropEnglish({ ...(translations ?? {}), ...(item.translations ?? {}) }, label);
  if (tr) out.translations = tr;
  if (item.slug !== undefined) out.link = slugToLink(item.slug);
  else if (item.link !== undefined) out.link = normalizeLink(item.link);
  if (item.collapsed !== undefined) out.collapsed = item.collapsed;
  const badge = convertBadge(item.badge);
  if (badge !== undefined) out.badge = badge;
  if (item.attrs && Object.keys(item.attrs).length) out.attrs = item.attrs;
  if (item.autogenerate) throw new Error(`autogenerate is not supported: ${JSON.stringify(item)}`);
  if (item.items) out.items = item.items.map(convertItem);
  return out;
}

function convertTopic(topic) {
  const out = {};
  const { label, translations } = splitLabel(topic.label);
  out.label = label;
  const tr = dropEnglish(translations, label);
  if (tr) out.translations = tr;
  if (topic.id) out.id = topic.id;
  if (topic.link !== undefined) out.link = normalizeLink(topic.link);
  if (topic.icon) out.icon = topic.icon;
  const badge = convertBadge(topic.badge);
  if (badge !== undefined) out.badge = badge;
  out.items = (topic.items ?? []).map(convertItem);
  return out;
}

// --- a small YAML emitter (the output is plain data: strings, booleans, numbers, maps and lists) ---

const reserved = /^(true|false|yes|no|on|off|null|~|y|n)$/i;
function scalar(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (value === null) return 'null';
  const s = String(value);
  if (
    /^[A-Za-z_/][A-Za-z0-9 _./()+-]*$/.test(s) &&
    !reserved.test(s) &&
    !s.endsWith(' ') &&
    !/^[-+]?[0-9.]+$/.test(s)
  ) {
    return s;
  }
  return JSON.stringify(s);
}

function isFlat(obj) {
  return Object.values(obj).every((v) => v === null || typeof v !== 'object');
}

function flowMap(obj) {
  return `{ ${Object.entries(obj).map(([k, v]) => `${key(k)}: ${scalar(v)}`).join(', ')} }`;
}

function key(k) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) ? k : JSON.stringify(k);
}

function emitMap(obj, indent) {
  const pad = ' '.repeat(indent);
  let out = '';
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      out += `${pad}${key(k)}:\n${emitList(v, indent + 2)}`;
    } else if (v !== null && typeof v === 'object') {
      out += isFlat(v) ? `${pad}${key(k)}: ${flowMap(v)}\n` : `${pad}${key(k)}:\n${emitMap(v, indent + 2)}`;
    } else {
      out += `${pad}${key(k)}: ${scalar(v)}\n`;
    }
  }
  return out;
}

function emitList(list, indent) {
  const pad = ' '.repeat(indent);
  let out = '';
  for (const item of list) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      if (isFlat(item)) {
        out += `${pad}- ${flowMap(item)}\n`;
      } else {
        const body = emitMap(item, indent + 2);
        out += `${pad}- ${body.slice(indent + 2)}`;
      }
    } else {
      out += `${pad}- ${scalar(item)}\n`;
    }
  }
  return out;
}

const header = (name, extra = '') => `# Sidebar topic '${name}' (sidebar.${name} in templates; the order of the topics is site.sidebar_topics).
# Generated once from src/frontend/config/sidebar/${name}.topics.ts by scripts/sidebar-from-ts.mjs; now hand maintained.
#
# Shape:
#   label: English label            translations: { <lang tag>: label } (de, ja, pt-BR, zh-CN, ...; nav_label: lang picks one)
#   link: /x/                       the topic root page
#   icon: open-book                 a Starlight icon name (the icon sprite)
#   items:                          groups and links
#     - label: Group                  translations?, collapsed?: true|false, badge?, items: [...]
#     - { label: Page, link: /x/y/ }  translations?, badge?: "Text" | { text, variant, translations? }, attrs?
# Links are site-root urls with a trailing slash (the root locale's); a locale prefix is added by the templates.
${extra}`;

mkdirSync(outDir, { recursive: true });

const files = readdirSync(sidebarDir).filter((f) => f.endsWith('.topics.ts') && f !== 'sidebar.topics.ts');
const byObject = new Map();
for (const file of files.sort()) {
  const name = file.replace(/\.topics\.ts$/, '');
  const mod = await import(pathToFileURL(join(sidebarDir, file)).href);
  const topic = Object.values(mod).find((v) => v && typeof v === 'object' && 'items' in v);
  if (!topic) throw new Error(`no topic export in ${file}`);
  byObject.set(topic, name);
  let extra = '';
  if (name === 'docs') {
    extra =
      '#\n# Pages that belong to no topic (starlight-sidebar-topics `exclude` in astro.config.mjs; they show no sidebar):\n' +
      exclude.map((e) => `#   ${e}`).join('\n') +
      '\n';
  }
  const yaml = header(name, extra) + '\n' + emitMap(convertTopic(topic), 0);
  writeFileSync(join(outDir, `${name}.yml`), yaml);
  console.log(`wrote data/sidebars/${name}.yml`);
}

const { sidebarTopics } = await import(pathToFileURL(join(sidebarDir, 'sidebar.topics.ts')).href);
const order = sidebarTopics.map((t) => byObject.get(t));
console.log(`sidebar_topics: [${order.join(', ')}]`);
