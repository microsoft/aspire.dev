#!/usr/bin/env node
// Extracts the <style> blocks of the API reference components and route pages of the Astro site and writes them to
// assets/css/api-components.css, scoped by a class on each component's root element instead of Astro's per element
// class. The API reference counterpart of scripts/extract-styles.mjs (which skips src/components/api-reference), with
// the same selector transform: every compound outside :global() gets :where(.cid-x, .cid-x *).
//
// Not a client script: a build-time helper, kept here with the API client code it belongs to (build-client.mjs only
// bundles *.ts files).
//
// Usage: node src/site/scripts/client/api/extract-styles.mjs
//
// Classes:
//   src/frontend/src/components/api-reference/<File>.astro   -> cid-api-reference-<kebab(File)> (componentClass)
//   src/frontend/src/pages/reference/api/<route>.astro       -> cid-api-page-<name> (table below), on a wrapper
//                                                               element around the page content inside <main>

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { componentClass } from '../../extract-styles.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '../../..');
const repoRoot = path.resolve(siteRoot, '../..');
const frontend = path.join(repoRoot, 'src/frontend');
const nodeModules = path.join(frontend, 'node_modules');

function loadFromPnpm(name) {
  const req = createRequire(path.join(frontend, 'package.json'));
  try {
    return req(name);
  } catch {
    const pnpm = path.join(nodeModules, '.pnpm');
    const prefix = name.replace('/', '+') + '@';
    const dirs = fs.readdirSync(pnpm).filter((d) => d.startsWith(prefix)).sort().reverse();
    for (const d of dirs) {
      const p = path.join(pnpm, d, 'node_modules', name);
      if (fs.existsSync(p)) return createRequire(path.join(p, 'package.json'))(p);
    }
    throw new Error(`cannot find ${name} in ${nodeModules}`);
  }
}

const postcss = loadFromPnpm('postcss');
const selectorParser = loadFromPnpm('postcss-selector-parser');

// The components the port uses (InheritanceDiagram, MemberList, MemberSignatureName and RemarksBlock are unused).
const COMPONENTS = [
  'AnchorHeading',
  'ApiSearchBar',
  'DocContent',
  'EnumTable',
  'Examples',
  'InpageSearch',
  'MemberCard',
  'MemberCardBase',
  'MemberOverviewList',
  'NuGetButton',
  'PolyglotAttributePanel',
  'TsMemberCard',
  'TypeHero',
  'TypeSignature',
  'VersionFilter',
];

const PAGES = [
  ['csharp/index.astro', 'cid-api-page-csharp-index'],
  ['csharp/[package]/index.astro', 'cid-api-page-csharp-package'],
  ['csharp/[package]/[type]/index.astro', 'cid-api-page-csharp-type'],
  ['csharp/[package]/[type]/[memberKind].astro', 'cid-api-page-csharp-members'],
  ['typescript/index.astro', 'cid-api-page-typescript-index'],
  ['typescript/[module]/index.astro', 'cid-api-page-typescript-module'],
  ['typescript/[module]/[item]/index.astro', 'cid-api-page-typescript-item'],
  ['typescript/[module]/[item]/[member]/index.astro', 'cid-api-page-typescript-member'],
];

function list() {
  const out = [];
  for (const name of COMPONENTS) {
    const rel = `api-reference/${name}.astro`;
    out.push({
      file: path.join(frontend, 'src/components', rel),
      display: `src/frontend/src/components/${rel}`,
      cls: componentClass('site', rel),
    });
  }
  for (const [rel, cls] of PAGES) {
    out.push({
      file: path.join(frontend, 'src/pages/reference/api', rel),
      display: `src/frontend/src/pages/reference/api/${rel}`,
      cls,
    });
  }
  return out;
}

function rootElement(source) {
  let text = source.replace(/^---[\s\S]*?\n---/, '');
  text = text.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const m = text.match(/<([a-z][a-z0-9-]*)\b((?:[^>{]|\{[^}]*\})*)>/);
  if (!m) return '';
  const cls = (m[2].match(/\bclass(?::list)?=("[^"]*"|'[^']*'|\{[^}]*\})/) || [])[1];
  return `<${m[1]}${cls ? ` class=${cls.replace(/\s+/g, ' ')}` : ''}>`;
}

function styleBlocks(source) {
  let text = source.replace(/^---[\s\S]*?\n---/, (m) => ' '.repeat(m.length));
  text = text.replace(/<script\b[\s\S]*?<\/script>/g, (m) => ' '.repeat(m.length));
  text = text.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
  const blocks = [];
  const re = /<style\b([^>]*)>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(text))) {
    const attrs = m[1];
    blocks.push({
      global: /\bis:global\b/.test(attrs),
      inline: /\bis:inline\b/.test(attrs),
      defineVars: /\bdefine:vars\b/.test(attrs),
      css: m[2],
    });
  }
  return blocks;
}

// Selector transform, as in scripts/extract-styles.mjs.
const pseudoElementsLegacy = new Set([':before', ':after', ':first-line', ':first-letter']);
const unscopedTags = new Set(['html', 'body']);

function scopeSelector(selector, cls, flags) {
  return selectorParser((root) => {
    root.each((sel) => {
      const compounds = [[]];
      sel.each((node) => {
        if (node.type === 'combinator') compounds.push(node, []);
        else compounds[compounds.length - 1].push(node);
      });
      for (const compound of compounds) {
        if (!Array.isArray(compound) || compound.length === 0) continue;
        let global = false;
        for (const node of [...compound]) {
          if (node.type === 'pseudo' && node.value === ':global') {
            global = true;
            flags.add(':global');
            if (node.nodes.length === 1) {
              const inner = node.nodes[0];
              const clones = inner.nodes.map((n) => n.clone());
              for (const c of clones) node.parent.insertBefore(node, c);
              node.remove();
            } else if (node.nodes.length === 0) {
              node.remove();
            } else {
              node.replaceWith(selectorParser.pseudo({ value: ':is', nodes: node.nodes }));
            }
          } else if (node.type === 'pseudo') {
            if ([':where', ':is', ':has', ':host', '::slotted', ':host-context'].includes(node.value)) flags.add(node.value);
          }
        }
        if (global) continue;
        if (compound.some((n) => n.type === 'nesting')) continue;
        const first = compound[0];
        if ((first.type === 'tag' && unscopedTags.has(first.value.toLowerCase())) || (first.type === 'pseudo' && first.value === ':root')) {
          continue;
        }
        const scope = selectorParser.pseudo({ value: ':where', nodes: [] });
        scope.nodes = selectorParser().astSync(`.${cls}, .${cls} *`).nodes;
        const pseudoElement = compound.find((n) => n.type === 'pseudo' && (n.value.startsWith('::') || pseudoElementsLegacy.has(n.value)));
        if (pseudoElement) pseudoElement.parent.insertBefore(pseudoElement, scope);
        else {
          const last = compound[compound.length - 1];
          last.parent.insertAfter(last, scope);
        }
      }
    });
  }).processSync(selector, { lossless: true });
}

function insideKeyframes(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true;
  }
  return false;
}

function transform(css, cls, { global }, report) {
  const root = postcss.parse(css);
  root.walkAtRules('import', (rule) => {
    report.notes.push(`@import ${rule.params} dropped`);
    rule.replaceWith(postcss.comment({ text: `@import ${rule.params}: dropped` }));
  });
  root.walkDecls((decl) => {
    const urls = decl.value.match(/url\(\s*['"]?(?!data:|https?:|\/|#)[^)'"]+/g);
    if (urls) report.notes.push(`relative url() to fix: ${decl.prop}: ${urls.join(', ')}`);
  });
  if (!global) {
    root.walkRules((rule) => {
      if (insideKeyframes(rule)) return;
      const flags = new Set();
      const before = rule.selector;
      rule.selector = scopeSelector(rule.selector, cls, flags);
      if (flags.size) report.flagged.push(`${[...flags].join(' ')}  ${before.replace(/\s+/g, ' ').trim()}`);
    });
  }
  return root.toString();
}

function dedent(css) {
  const lines = css.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[\t ]*/)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

export function extract() {
  const sections = [];
  const table = [];
  const flaggedAll = [];
  const notes = [];
  let blocksCount = 0;
  for (const c of list()) {
    const source = fs.readFileSync(c.file, 'utf8');
    const blocks = styleBlocks(source);
    const root = rootElement(source);
    const kinds = [];
    const parts = [];
    for (const b of blocks) {
      if (b.inline) {
        notes.push(`${c.display}: <style is:inline> not extracted`);
        kinds.push('inline');
        continue;
      }
      if (b.defineVars) notes.push(`${c.display}: <style define:vars>: the partial must set the CSS variables`);
      const report = { flagged: [], notes: [] };
      const css = transform(dedent(b.css), c.cls, b, report);
      blocksCount++;
      kinds.push(b.global ? 'global' : 'scoped');
      for (const f of report.flagged) flaggedAll.push(`${c.cls}: ${f}`);
      for (const n of report.notes) notes.push(`${c.display}: ${n}`);
      parts.push(`/* ${b.global ? '<style is:global>: unscoped' : '<style>'} */\n${css.trim()}`);
    }
    table.push(`${c.display} -> .${c.cls} (${kinds.join(', ') || 'no styles'})${root ? ` root ${root}` : ''}`);
    if (parts.length) sections.push(`/* ==== ${c.display} -> .${c.cls} ==== */\n${parts.join('\n\n')}\n`);
  }
  const header = `/*
 * Scoped styles of the API reference components and route pages, ported to the Liquid partials of templates/api and
 * the route templates of content/reference/api.
 * GENERATED by src/site/scripts/client/api/extract-styles.mjs from the <style> blocks of
 * src/frontend/src/components/api-reference and src/frontend/src/pages/reference/api: do not edit by hand, change the
 * script or the port, and run \`node src/site/scripts/client/api/extract-styles.mjs\`.
 *
 * Each component's root element(s) must carry its class; each route template puts its page class on a wrapper element
 * around the page content inside <main>. Every compound selector of a scoped block gets :where(.cid-x, .cid-x *)
 * (zero specificity, like Astro's 'where' strategy that Starlight uses).
 *
 * Components and pages (${table.length}), source -> class:
${table.map((t) => ` *   ${t}`).join('\n')}
 *
 * Selectors to check by hand (${flaggedAll.length}: they used :global(), :where(), :is(), :has() or :host):
${flaggedAll.map((t) => ` *   ${t.replace(/\*\//g, '* /')}`).join('\n')}
 *
 * Notes (${notes.length}):
${notes.map((t) => ` *   ${t.replace(/\*\//g, '* /')}`).join('\n')}
 */
`;
  const target = path.join(siteRoot, 'assets/css/api-components.css');
  fs.writeFileSync(target, header + '\n' + sections.join('\n'));
  return { entries: table.length, blocks: blocksCount, flagged: flaggedAll.length, notes, target };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = extract();
  console.log(`${path.relative(process.cwd(), r.target)}: ${r.entries} components and pages, ${r.blocks} blocks, ${r.flagged} selectors flagged, ${r.notes.length} notes`);
}
