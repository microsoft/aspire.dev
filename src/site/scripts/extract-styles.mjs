#!/usr/bin/env node
// Extracts the <style> blocks of the Astro components that the Douze chrome port reproduces as Liquid partials and
// shortcodes, and writes them to assets/css/components.css, scoped by a class on each component's root element(s)
// instead of Astro's per element `astro-*` class.
//
// Usage (from the repository root or anywhere): node src/site/scripts/extract-styles.mjs
//
// The class of a component (also exported as `componentClass` for other scripts):
//   site component   src/frontend/src/components/<dirs>/<File>.astro          -> cid-<dirs joined by ->-<kebab(File)>
//   Starlight        @astrojs/starlight/{components,user-components,components-internals}/<dirs>/<File>
//                                                                             -> cid-sl-<kebab(File)>
//   plugins          <package>/<first dir>/<dirs>/<File>.astro                 -> cid-<short>-<dirs>-<kebab(File)>
//                    (short: starlight-kbd kbd, starlight-page-actions page-actions, starlight-plugin-icons icons,
//                     starlight-image-zoom image-zoom, starlight-sidebar-topics topics; the first directory
//                     (components, overrides, user-components, icons, src/components) is dropped)
//
// Selector transform. Starlight sets Astro's `scopedStyleStrategy: 'where'`: Astro appends `:where(.astro-xxxx)` to
// every compound selector (zero specificity) and puts the class on every element of the component, and on the root
// of child components that take a `class` prop. Here each block becomes
//   @scope (.cid-x) to ([class*="cid-"]:not(.cid-x, <pass-through roots>)) { S, C1:where(:scope) ... }
// so a rule matches the root (the `:where(:scope)` variant) and its descendants, but not the inside of a nested
// component (another `cid-*` root: the scope's lower boundary), except the roots of the components that receive
// the parent's class in Astro (Icon, Badge, LinkButton, CustomSelect, the page actions Button), which stay in scope.
// Specificity is unchanged (implicit :scope and :where() add none). Differences, by design:
//   - slotted content (Markdown in a component body) still matches the component's rules (Astro would not);
//   - selectors with `:global()`, an `html`/`body`/`:root` first compound or a nesting selector `&` cannot be
//     scope-relative: they get the fallback `:where(.cid-x, .cid-x *)` on every other compound, outside @scope
//     (after the block's scoped rules); `:global(X)` is unwrapped and its compound is not scoped (same as Astro);
//   - @scope adds "scope proximity" to the cascade (after specificity, before order): an unscoped rule loses every
//     tie with a scoped one. Rules outside @scope (the fallback above and `<style is:global>` blocks) get 0-0-1
//     of specificity on their subject (`:not(cid-never)`) so that the overrides written with `:global()` keep
//     winning their ties as they did by coming later in the Astro bundle;
//   - an element of a component rendered inside another component's markup in a partial but slotted in Astro
//     (the header in the page frame, the main column) is in the parent's scope only if it carries the parent's
//     class: the partials put the class of the component that owns the markup on such elements;
//   - compounds made of `html`, `body` or `:root` are not scoped; `@keyframes` are copied as they are;
//   - compounds holding a nesting selector `&` are not scoped (their parent is);
//   - `<style is:global>` blocks are copied unscoped; `<style is:inline>` blocks are skipped (they stay inline in
//     the partial that ports the component) and listed;
//   - `@import` inside a component style is dropped and listed (site-entry.css imports the vendored file instead);
//   - `define:vars` styles are scoped as usual; the variables must be set by the partial (listed).
// Cascade layers are kept: a block wrapped in `@layer starlight.core { ... }` stays in that layer, an unwrapped
// block stays unlayered, as in the Astro build.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '..');
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

export function kebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

const pluginShort = {
  'starlight-kbd': 'kbd',
  'starlight-page-actions': 'page-actions',
  'starlight-plugin-icons': 'icons',
  'starlight-image-zoom': 'image-zoom',
  'starlight-sidebar-topics': 'topics',
};
const droppedFirstDirs = ['src/components', 'components', 'overrides', 'user-components', 'icons'];

/**
 * The scope class of a component.
 * @param {'site'|'starlight'|string} source 'site', 'starlight' or a plugin package name
 * @param {string} relativePath path of the .astro file relative to the components folder (site), the package root
 *   (plugins) or `components`/`user-components` (Starlight)
 */
export function componentClass(source, relativePath) {
  const parts = relativePath.replace(/\\/g, '/').replace(/\.astro$/, '').split('/');
  const file = kebab(parts.pop());
  if (source === 'site') return ['cid', ...parts.map(kebab), file].join('-');
  if (source === 'starlight') return `cid-sl-${file}`;
  let dirs = parts.join('/');
  for (const d of droppedFirstDirs) {
    if (dirs === d) { dirs = ''; break; }
    if (dirs.startsWith(d + '/')) { dirs = dirs.slice(d.length + 1); break; }
  }
  const short = pluginShort[source];
  if (!short) throw new Error(`unknown plugin ${source}`);
  return ['cid', short, ...(dirs ? dirs.split('/').map(kebab) : []), file].join('-');
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.astro')) out.push(p);
  }
  return out.sort();
}

function components() {
  const list = [];
  const starlight = fs.realpathSync(path.join(nodeModules, '@astrojs/starlight'));
  for (const sub of ['components', 'user-components', 'components-internals']) {
    for (const f of walk(path.join(starlight, sub))) {
      list.push({ source: 'starlight', file: f, display: `@astrojs/starlight/${sub}/${path.relative(path.join(starlight, sub), f)}`, cls: componentClass('starlight', path.relative(path.join(starlight, sub), f)) });
    }
  }
  for (const pkg of Object.keys(pluginShort)) {
    const root = fs.realpathSync(path.join(nodeModules, pkg));
    for (const f of walk(root)) {
      const rel = path.relative(root, f);
      list.push({ source: pkg, file: f, display: `${pkg}/${rel}`, cls: componentClass(pkg, rel) });
    }
  }
  const siteComponents = path.join(frontend, 'src/components');
  for (const f of walk(siteComponents)) {
    const rel = path.relative(siteComponents, f);
    if (rel.startsWith('api-reference/') || rel.startsWith('lunaria/')) continue;
    list.push({ source: 'site', file: f, display: `src/frontend/src/components/${rel}`, cls: componentClass('site', rel) });
  }
  return list;
}

// The first HTML element of the template (lowercase tag or custom element), as a hint for the partial's author:
// the class goes on it and on any other top-level element.
function rootElement(source) {
  let text = source.replace(/^---[\s\S]*?\n---/, '');
  text = text.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const m = text.match(/<([a-z][a-z0-9-]*)\b((?:[^>{]|\{[^}]*\})*)>/);
  if (!m) return '';
  const cls = (m[2].match(/\bclass(?::list)?=("[^"]*"|'[^']*'|\{[^}]*\})/) || [])[1];
  return `<${m[1]}${cls ? ` class=${cls.replace(/\s+/g, ' ')}` : ''}>`;
}

function styleBlocks(source) {
  // Drop the front matter and the scripts, then find the <style> tags.
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
      lang: (attrs.match(/\blang=["']([^"']+)/) || [])[1],
      css: m[2],
    });
  }
  return blocks;
}

const postcss = loadFromPnpm('postcss');
const selectorParser = loadFromPnpm('postcss-selector-parser');

const pseudoElementsLegacy = new Set([':before', ':after', ':first-line', ':first-letter']);
const unscopedTags = new Set(['html', 'body']);

function scopeSelector(selector, cls, flags) {
  const where = `:where(.${cls}, .${cls} *)`;
  return selectorParser((root) => {
    root.each((sel) => {
      // Split the complex selector into compounds.
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
        // html, body and :root compounds (html[data-theme='light'], :root:not(...)) stay unscoped.
        if ((first.type === 'tag' && unscopedTags.has(first.value.toLowerCase())) || (first.type === 'pseudo' && first.value === ':root')) {
          continue;
        }
        const scope = selectorParser.pseudo({ value: ':where', nodes: [] });
        // Build the :where() argument by parsing it, so it prints as written.
        const parsed = selectorParser().astSync(`.${cls}, .${cls} *`);
        scope.nodes = parsed.nodes;
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

// Components whose root receives the parent's scope in Astro (they take a `class` prop and the compiler adds the
// parent's scope class to it): a parent's rules still match their root element.
const classPassThrough = ['cid-sl-icon', 'cid-sl-badge', 'cid-sl-link-button', 'cid-custom-select', 'cid-page-actions-button'];

function scopePrelude(cls) {
  const keep = [cls, ...classPassThrough.filter((c) => c !== cls)].map((c) => `.${c}`).join(', ');
  return `(.${cls}) to ([class*="cid-"]:not(${keep}))`;
}

/** Whether a selector must use the :where() fallback instead of @scope (see the header comment). */
function isLegacySelector(selector) {
  let legacy = false;
  selectorParser((root) => {
    root.each((sel) => {
      sel.walk((node) => {
        if (node.type === 'pseudo' && node.value === ':global') legacy = true;
        if (node.type === 'nesting') legacy = true;
      });
      const first = sel.nodes[0];
      if (first && ((first.type === 'tag' && unscopedTags.has(first.value.toLowerCase())) || (first.type === 'pseudo' && first.value === ':root'))) legacy = true;
    });
  }).processSync(selector);
  return legacy;
}

/** `S` and `S` whose first compound is the scope root (`C1:where(:scope) ...`), for use inside @scope. */
function scopedVariants(selector, flags) {
  const out = [selector.trim()];
  const rooted = selectorParser((root) => {
    root.each((sel) => {
      sel.walk((node) => {
        if (node.type === 'pseudo' && [':where', ':is', ':has', ':host', '::slotted', ':host-context'].includes(node.value)) flags.add(node.value);
      });
      const compound = [];
      for (const node of sel.nodes) {
        if (node.type === 'combinator') break;
        compound.push(node);
      }
      if (!compound.length) return;
      const scope = selectorParser.pseudo({ value: ':where', nodes: [] });
      scope.nodes = selectorParser().astSync(':scope').nodes;
      const pseudoElement = compound.find((n) => n.type === 'pseudo' && (n.value.startsWith('::') || pseudoElementsLegacy.has(n.value)));
      if (pseudoElement) pseudoElement.parent.insertBefore(pseudoElement, scope);
      else compound[compound.length - 1].parent.insertAfter(compound[compound.length - 1], scope);
    });
  }).processSync(selector.trim(), { lossless: false });
  out.push(rooted);
  // A sibling combinator can join two roots of the component (Starlight's `.content-panel + .content-panel`): the
  // subject is then a scope root of its own, outside the scope of its sibling, so neither variant above matches it.
  // A third variant makes the subject compound the scope root (`C1 + C2:where(:scope)`).
  let sibling = false;
  const subjectRooted = selectorParser((root) => {
    root.each((sel) => {
      if (!sel.nodes.some((node) => node.type === 'combinator' && ['+', '~'].includes(node.value.trim()))) return;
      sibling = true;
      const nodes = sel.nodes;
      let start = nodes.length;
      while (start > 0 && nodes[start - 1].type !== 'combinator') start--;
      const compound = nodes.slice(start);
      if (!compound.length) return;
      const scope = selectorParser.pseudo({ value: ':where', nodes: [] });
      scope.nodes = selectorParser().astSync(':scope').nodes;
      const pseudoElement = compound.find((n) => n.type === 'pseudo' && (n.value.startsWith('::') || pseudoElementsLegacy.has(n.value)));
      if (pseudoElement) pseudoElement.parent.insertBefore(pseudoElement, scope);
      else compound[compound.length - 1].parent.insertAfter(compound[compound.length - 1], scope);
    });
  }).processSync(selector.trim(), { lossless: false });
  if (sibling) out.push(subjectRooted);
  return out;
}

/**
 * Adds 0-0-1 of specificity to the subject compound (`:not(cid-never)`): rules outside @scope (`:global()`
 * selectors, `<style is:global>` blocks) would otherwise lose every tie with a scoped rule (@scope's proximity),
 * where in the Astro bundle the later rule won; the overriding rules (an override's `:global(.plugin-class)`) come
 * after the rules they override, so a tie now goes to them as it did. A subject made only of :where() is left as
 * it is: its zero specificity says it is a default to override.
 */
function bumpSelector(selector) {
  return selectorParser((root) => {
    root.each((sel) => {
      const nodes = sel.nodes;
      let start = nodes.length;
      while (start > 0 && nodes[start - 1].type !== 'combinator') start--;
      const compound = nodes.slice(start);
      if (!compound.length) return;
      // A subject written as :where() only is meant to lose every tie (`.dev-center :where(button)`, a default that
      // the component and global rules override): bumping it would make it beat the global stylesheets' rules.
      if (compound.every((n) => n.type === 'pseudo' && n.value === ':where')) return;
      const bump = selectorParser.pseudo({ value: ':not', nodes: [] });
      bump.nodes = selectorParser().astSync('cid-never').nodes;
      const pseudoElement = compound.find((n) => n.type === 'pseudo' && (n.value.startsWith('::') || pseudoElementsLegacy.has(n.value)));
      if (pseudoElement) pseudoElement.parent.insertBefore(pseudoElement, bump);
      else compound[compound.length - 1].parent.insertAfter(compound[compound.length - 1], bump);
    });
  }).processSync(selector, { lossless: true });
}

const groupingAtRules = new Set(['media', 'supports', 'container', 'layer', 'starting-style']);

function pruneEmpty(root) {
  let changed = true;
  while (changed) {
    changed = false;
    root.walkAtRules((rule) => {
      if (rule.nodes && rule.nodes.filter((n) => n.type !== 'comment').length === 0) {
        rule.remove();
        changed = true;
      }
    });
  }
}

/** Wraps the nodes of `container` in @scope, inside @layer blocks so that the layer stays outermost. */
function wrapInScope(container, prelude) {
  const nodes = [...container.nodes];
  let pending = [];
  const flush = (before) => {
    if (!pending.filter((n) => n.type !== 'comment').length) {
      pending = [];
      return;
    }
    const scope = postcss.atRule({ name: 'scope', params: prelude });
    if (before) container.insertBefore(before, scope);
    else container.append(scope);
    for (const n of pending) {
      n.remove();
      n.raws.before = '\n';
      scope.append(n);
    }
    scope.raws.after = '\n';
    pending = [];
  };
  for (const node of nodes) {
    if (node.type === 'atrule' && node.name === 'layer' && node.nodes) {
      flush(node);
      wrapInScope(node, prelude);
    } else {
      pending.push(node);
    }
  }
  flush(null);
}

function transform(css, cls, { global }, report) {
  const root = postcss.parse(css);
  root.walkAtRules('import', (rule) => {
    report.imports.push(rule.params);
    rule.replaceWith(postcss.comment({ text: `@import ${rule.params}: dropped, imported by site-entry.css` }));
  });
  root.walkDecls((decl) => {
    const urls = decl.value.match(/url\(\s*['"]?(?!data:|https?:|\/|#)[^)'"]+/g);
    if (urls) report.urls.push(`${decl.prop}: ${urls.join(', ')}`);
  });
  if (global) {
    root.walkRules((rule) => {
      if (!insideKeyframes(rule)) rule.selector = bumpSelector(rule.selector);
    });
    return root.toString();
  }

  // Two copies of the block: the selectors that @scope can express, and the rest (:global(), html/body/:root
  // compounds, nesting) scoped with :where(.cid-x, .cid-x *) as a fallback. @keyframes and other non-grouping
  // at-rules stay in the second copy only.
  const scoped = root.clone();
  const legacy = root.clone();
  scoped.walkAtRules((rule) => {
    if (!groupingAtRules.has(rule.name.toLowerCase())) rule.remove();
  });
  scoped.walkRules((rule) => {
    const flags = new Set();
    const selectors = rule.selectors.filter((sel) => !isLegacySelector(sel));
    if (!selectors.length) {
      rule.remove();
      return;
    }
    rule.selectors = selectors.flatMap((sel) => scopedVariants(sel, flags));
    if (flags.size) report.flagged.push(`${[...flags].join(' ')}  ${selectors.join(', ').replace(/\s+/g, ' ').trim()}`);
  });
  legacy.walkRules((rule) => {
    if (insideKeyframes(rule)) return;
    const selectors = rule.selectors.filter((sel) => isLegacySelector(sel));
    if (!selectors.length) {
      rule.remove();
      return;
    }
    const flags = new Set();
    const before = selectors.join(', ');
    rule.selector = bumpSelector(scopeSelector(before, cls, flags));
    if (flags.size) report.flagged.push(`${[...flags].join(' ')}  ${before.replace(/\s+/g, ' ').trim()}`);
  });
  pruneEmpty(scoped);
  pruneEmpty(legacy);
  wrapInScope(scoped, scopePrelude(cls));
  // Drop a copy holding only comments. The comment body must not contain `*/`: a lazy [\s\S]*? would let one
  // "comment" span from the first `/*` to the last `*/` and drop a copy whose rules sit between two comments.
  const parts = [scoped.toString().trim(), legacy.toString().trim()].filter((p) => p && !/^(\/\*(?:(?!\*\/)[\s\S])*\*\/\s*)*$/.test(p));
  return parts.join('\n');
}

function dedent(css) {
  const lines = css.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[\t ]*/)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

export function extract() {
  const all = components();
  const seen = new Map();
  for (const c of all) {
    if (seen.has(c.cls)) throw new Error(`class collision: ${c.cls} for ${seen.get(c.cls)} and ${c.display}`);
    seen.set(c.cls, c.display);
  }
  const sections = [];
  const table = [];
  const flaggedAll = [];
  const notes = [];
  let blocksCount = 0;
  for (const c of all) {
    const sourceText = fs.readFileSync(c.file, 'utf8');
    const blocks = styleBlocks(sourceText);
    const rootHint = rootElement(sourceText);
    if (!blocks.length) continue;
    const parts = [];
    const kinds = [];
    for (const b of blocks) {
      if (b.inline) {
        notes.push(`${c.display}: <style is:inline> kept inline in the partial (not extracted)`);
        kinds.push('inline');
        continue;
      }
      if (b.lang && b.lang !== 'css') notes.push(`${c.display}: <style lang="${b.lang}"> copied as CSS, check`);
      if (b.defineVars) notes.push(`${c.display}: <style define:vars> the partial must set the CSS variables on its root element`);
      const report = { flagged: [], imports: [], urls: [] };
      const css = transform(dedent(b.css), c.cls, b, report);
      blocksCount++;
      kinds.push(b.global ? 'global' : 'scoped');
      for (const f of report.flagged) flaggedAll.push(`${c.cls}: ${f}`);
      for (const i of report.imports) notes.push(`${c.display}: @import ${i} dropped (vendored and imported by site-entry.css)`);
      for (const u of report.urls) notes.push(`${c.display}: relative url() to fix: ${u}`);
      parts.push(`/* ${b.global ? '<style is:global>: unscoped' : '<style>'} */\n${css.trim()}`);
    }
    if (!parts.length) {
      table.push(`${c.display} -> .${c.cls} (${kinds.join(', ')})${rootHint ? ` root ${rootHint}` : ''}`);
      continue;
    }
    table.push(`${c.display} -> .${c.cls} (${kinds.join(', ')})${rootHint ? ` root ${rootHint}` : ''}`);
    sections.push(`/* ==== ${c.display} -> .${c.cls} ==== */\n${parts.join('\n\n')}\n`);
  }
  const header = `/*
 * Scoped styles of the Astro components ported to Liquid partials and shortcodes.
 * GENERATED by src/site/scripts/extract-styles.mjs from the components' <style> blocks: do not edit by hand,
 * change the script or the port, and run \`node src/site/scripts/extract-styles.mjs\`.
 *
 * Each component's root element(s) must carry its class (table below). Every compound selector of a scoped block
 * gets :where(.cid-x, .cid-x *) (zero specificity, like Astro's 'where' strategy that Starlight uses).
 *
 * Components with styles (${table.length}), component -> class:
${table.map((t) => ` *   ${t}`).join('\n')}
 *
 * Selectors to check by hand (${flaggedAll.length}: they used :global(), :where(), :is(), :has() or :host):
${flaggedAll.map((t) => ` *   ${t.replace(/\*\//g, '* /')}`).join('\n')}
 *
 * Notes (${notes.length}):
${notes.map((t) => ` *   ${t.replace(/\*\//g, '* /')}`).join('\n')}
 */
`;
  const out = header + '\n' + sections.join('\n');
  const target = path.join(siteRoot, 'assets/css/components.css');
  fs.writeFileSync(target, out);
  return { components: table.length, blocks: blocksCount, flagged: flaggedAll.length, notes, target };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = extract();
  console.log(`${path.relative(process.cwd(), r.target)}: ${r.components} components, ${r.blocks} blocks, ${r.flagged} selectors flagged, ${r.notes.length} notes`);
}
