#!/usr/bin/env node
// The code highlighting worker of the site: renders the fenced code blocks of HTML pages with Expressive Code,
// configured by ../ec.config.mjs (themes, plugins, twoslash), so the pages keep the markup and the styles the Astro
// site had.
//
//   node scripts/code-worker.mjs                    a Douze worker (protocol 1, scripts/douze-worker.mjs)
//   node scripts/code-worker.mjs --assets <folder>  writes <folder>/assets/code.css and <folder>/assets/code.js
//
// Worker: each `file` request is an HTML page. Every block Douze's `markdown` step rendered from a fence,
//
//   <pre data-lang="csharp" data-meta="title=&quot;Program.cs&quot; {3-4}"><code class="language-csharp">escaped</code></pre>
//
// (`data-meta` absent when the fence has no meta; `<pre><code>` for a fence without a language, rendered as plain
// text as Expressive Code does), is decoded, rendered with `engine.render({ code, language, meta })` and replaced by
// the rendered HTML. Other `<pre>` elements (`<pre class="mermaid">`, already highlighted code) are left alone. A
// fence whose language Shiki does not know is left as it is with a warning, as is a fence whose render fails. The
// answer is the page's new content.
//
// Options (`with:` of the step):
//   cache: <folder>   per-fence cache, relative to the source folder: every rendered block is stored under a key
//                     of (engine version, configuration hash, language, meta, locale, code) and reused.
//
// Twoslash: with TWOSLASH=douze in the environment, the twoslash plugin renders the results of Douze's `twoslash`
// step, which a fence carries in its `data-twoslash` attribute (scripts/twoslash-results.mjs stands in for
// `@ec-ts/twoslash`), and TypeScript compiles nothing here. Otherwise the plugin compiles the snippets with the
// TypeScript of node_modules, as the Astro site does.
//
// The engine's styles and scripts are not in the pages: `--assets` writes them once (the `code-assets` batch step),
// and the layout links them. Twoslash fences are compiled one at a time (ec.config.mjs) while the others render
// concurrently; the worker takes as many pages at once as there are CPUs.
//
// Nothing is written on stderr but fatal errors: logs, including the console output of the engine and its plugins,
// go to Douze as `log` messages.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ExpressiveCode, ExpressiveCodeTheme, loadShikiTheme } from 'expressive-code';
import { toHtml } from 'expressive-code/hast';
import { isSpecialLang } from 'shiki/core';
import { bundledLanguages } from 'shiki/langs';
import { serve } from './douze-worker.mjs';
import { addTwoslashResult } from './twoslash-results.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const siteRoot = resolve(dirname(scriptPath), '..');
const configPath = join(siteRoot, 'ec.config.mjs');

const assetsIndex = process.argv.indexOf('--assets');
const assetsMode = assetsIndex !== -1;

// Twoslash results from Douze's step: the plugin's twoslasher is resolved to the module that returns them.
const nativeTwoslash = process.env.TWOSLASH === 'douze';
if (nativeTwoslash) {
  const results = pathToFileURL(join(dirname(scriptPath), 'twoslash-results.mjs')).href;
  registerHooks({
    resolve: (specifier, context, next) => (specifier === '@ec-ts/twoslash' ? { url: results, shortCircuit: true } : next(specifier, context)),
  });
}

// Logs: protocol messages in worker mode (stdout carries the protocol, so the console must not write on it), plain
// lines on stdout with --assets.
function log(level, message) {
  if (assetsMode) {
    process.stdout.write(`${level}: ${message}\n`);
  } else {
    process.stdout.write(JSON.stringify({ type: 'log', level, message: String(message) }) + '\n');
  }
}

const format = (args) => args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
console.log = console.info = (...args) => log('info', format(args));
console.debug = console.trace = (...args) => log('debug', format(args));
console.warn = (...args) => log('warn', format(args));
console.error = (...args) => log('error', format(args));

function fatal(error) {
  process.stderr.write(`code-worker: ${error?.stack ?? error}\n`);
  process.exit(1);
}

process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);

// ---------------------------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------------------------

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// What the rendered HTML depends on besides the fence: the versions of the packages (the lock file pins them all),
// this script, the configuration and the files it reads.
function computeVersions(cacheInputs) {
  const packageVersion = JSON.parse(readFileSync(join(siteRoot, 'node_modules/expressive-code/package.json'), 'utf8')).version;
  const lockPath = join(siteRoot, 'pnpm-lock.yaml');
  const engineVersion = `expressive-code@${packageVersion}+${existsSync(lockPath) ? sha256(readFileSync(lockPath)).slice(0, 16) : 'nolock'}`;
  const hash = createHash('sha256');
  for (const file of [scriptPath, configPath, ...cacheInputs]) {
    hash.update(file.slice(siteRoot.length)).update('\0');
    hash.update(existsSync(file) ? readFileSync(file) : '').update('\0');
  }
  hash.update(nativeTwoslash ? 'twoslash:douze' : 'twoslash:node');
  return { engineVersion, configHash: hash.digest('hex') };
}

async function createEngine() {
  const started = performance.now();
  const configModule = await import(pathToFileURL(configPath).href);
  const { themes = [], logger, ...config } = configModule.default;
  const cacheInputs = configModule.cacheInputs ?? [];
  const tabWidth = configModule.tabWidth ?? 2;

  // Bundled theme names are loaded as `rehype-expressive-code` does.
  const loadedThemes = await Promise.all(
    themes.map(async (theme) =>
      theme instanceof ExpressiveCodeTheme ? theme : new ExpressiveCodeTheme(typeof theme === 'string' ? await loadShikiTheme(theme) : theme)
    )
  );

  const engine = new ExpressiveCode({
    ...config,
    themes: loadedThemes,
    logger: {
      label: 'expressive-code',
      debug: (message) => log('debug', message),
      info: (message) => log('info', message),
      warn: (message) => log('warn', message),
      error: (message) => log('error', message),
      ...logger,
    },
  });

  // The languages the Shiki plugin can load: bundled ones and their aliases, the configured ones, plain text.
  const langAlias = config.shiki?.langAlias ?? {};
  const customLanguages = new Set(
    (config.shiki?.langs ?? []).flatMap((lang) => (typeof lang === 'object' && lang ? [lang.name, ...(lang.aliases ?? [])] : []))
  );
  const isKnownLanguage = (language) => {
    const resolved = langAlias[language] ?? language;
    return !resolved || isSpecialLang(resolved) || Object.hasOwn(bundledLanguages, resolved) || customLanguages.has(resolved);
  };

  return {
    engine,
    tabWidth,
    isKnownLanguage,
    ...computeVersions(cacheInputs),
    loadTime: performance.now() - started,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// --assets
// ---------------------------------------------------------------------------------------------------------------

if (assetsMode) {
  const folder = process.argv[assetsIndex + 1];
  if (!folder) fatal(new Error('usage: node scripts/code-worker.mjs --assets <folder>'));
  try {
    const { engine } = await createEngine();
    const styles = `${await engine.getBaseStyles()}${await engine.getThemeStyles()}`;
    const scripts = [...new Set(await engine.getJsModules())].join('\n');
    const outDir = join(resolve(folder), 'assets');
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'code.css'), styles);
    await writeFile(join(outDir, 'code.js'), scripts);
    log('info', `wrote ${join(outDir, 'code.css')} (${styles.length} chars) and ${join(outDir, 'code.js')} (${scripts.length} chars)`);
  } catch (error) {
    fatal(error);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------------------
// Fences
// ---------------------------------------------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  if (!text.includes('&')) return text;
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (entity, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[name] ?? entity;
  });
}

const PRE_TAG = /<pre((?:\s+data-(?:lang|meta|twoslash)="[^"]*")*)\s*>/y;
const CODE_TAG = /<code(?:\s[^>]*)?>/y;
const PRE_ATTRIBUTE = /data-(lang|meta|twoslash)="([^"]*)"/g;
const CODE_END = '</code></pre>';

/**
 * The fences of a page: `<pre>` elements with only `data-lang` and `data-meta` attributes (or none) whose only child
 * is a `<code>` element holding escaped text, as Douze's `markdown` step writes them, and the `data-twoslash`
 * attribute of the `twoslash` step.
 */
function findFences(html) {
  const fences = [];
  let index = 0;
  while ((index = html.indexOf('<pre', index)) !== -1) {
    PRE_TAG.lastIndex = index;
    const pre = PRE_TAG.exec(html);
    if (!pre) {
      index += 4;
      continue;
    }
    CODE_TAG.lastIndex = PRE_TAG.lastIndex;
    const code = CODE_TAG.exec(html);
    const end = code ? html.indexOf(CODE_END, CODE_TAG.lastIndex) : -1;
    const text = end === -1 ? '' : html.slice(CODE_TAG.lastIndex, end);
    if (!code || end === -1 || text.includes('<')) {
      index = PRE_TAG.lastIndex;
      continue;
    }
    const attributes = {};
    for (const [, name, value] of pre[1].matchAll(PRE_ATTRIBUTE)) attributes[name] = decodeEntities(value);
    fences.push({
      start: index,
      end: end + CODE_END.length,
      language: attributes.lang ?? '',
      meta: attributes.meta ?? '',
      twoslash: attributes.twoslash,
      // Douze ends every line with a newline; the fence's code does not end with one.
      code: decodeEntities(text).replace(/\r?\n$/, ''),
    });
    index = end + CODE_END.length;
  }
  return fences;
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering, with the per-fence cache
// ---------------------------------------------------------------------------------------------------------------

// Twoslash renders the JSDoc of a hover as paragraphs inside a paragraph, which an HTML parser cannot represent: it
// closes the outer paragraph at the inner one, and turns the outer end tag into an empty paragraph. The Astro site
// served what its HTML parser made of it; this does the same to the tree, so the markup is the same and valid.
const CLOSES_P = new Set(
  'address article aside blockquote details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol p pre section summary table ul'.split(' ')
);
const closesParagraph = (node) => node.type === 'element' && CLOSES_P.has(node.tagName);
const isSplitParagraph = (node) => node.type === 'element' && node.tagName === 'p' && node.children?.some(closesParagraph);

function splitNestedParagraphs(node) {
  if (!node.children) return;
  node.children.forEach(splitNestedParagraphs);
  if (!node.children.some(isSplitParagraph)) return;
  node.children = node.children.flatMap((child) => {
    if (!isSplitParagraph(child)) return [child];
    const index = child.children.findIndex(closesParagraph);
    return [
      { ...child, children: child.children.slice(0, index) },
      ...child.children.slice(index),
      { type: 'element', tagName: 'p', properties: {}, children: [] },
    ];
  });
}

const createdCacheFolders = new Map();

function ensureFolder(folder) {
  let created = createdCacheFolders.get(folder);
  if (!created) {
    created = mkdir(folder, { recursive: true });
    createdCacheFolders.set(folder, created);
  }
  return created;
}

async function renderFence(state, fence, { path, locale, cacheDir, stats }) {
  const { engine, tabWidth, engineVersion, configHash } = state;
  const code = tabWidth > 0 ? fence.code.replace(/\t/g, ' '.repeat(tabWidth)) : fence.code;

  // The step's result is part of the fence: a new engine or new types change the rendered hovers.
  const twoslash = nativeTwoslash ? fence.twoslash : undefined;
  if (twoslash !== undefined) addTwoslashResult(code, twoslash);

  let cacheFile;
  if (cacheDir) {
    const key = sha256(JSON.stringify([engineVersion, configHash, fence.language, fence.meta, locale ?? '', code, ...(twoslash !== undefined ? [twoslash] : [])]));
    cacheFile = join(cacheDir, key.slice(0, 2), `${key}.html`);
    try {
      const html = await readFile(cacheFile, 'utf8');
      stats.cached++;
      return html;
    } catch {
      // Not cached yet.
    }
  }

  const started = performance.now();
  const { renderedGroupAst, styles } = await engine.render({
    code,
    language: fence.language,
    meta: fence.meta,
    locale,
    parentDocument: { sourceFilePath: path },
  });

  // Styles of this block only (base and theme styles are in code.css), as the Astro integration inlines them.
  if (styles.size) {
    const first = renderedGroupAst.children[0];
    const afterStyle = first?.type === 'element' && (first.tagName === 'style' || first.tagName === 'link');
    renderedGroupAst.children.splice(afterStyle ? 1 : 0, 0, {
      type: 'element',
      tagName: 'style',
      properties: {},
      children: [{ type: 'text', value: [...styles].join('') }],
    });
  }

  splitNestedParagraphs(renderedGroupAst);
  const html = toHtml(renderedGroupAst);
  const elapsed = performance.now() - started;
  stats.rendered++;
  if (/\btwoslash\b/.test(fence.meta)) {
    stats.twoslash++;
    stats.twoslashTime += elapsed;
  }

  if (cacheFile) {
    await ensureFolder(dirname(cacheFile));
    const temporary = `${cacheFile}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temporary, html);
    await rename(temporary, cacheFile);
  }
  return html;
}

async function highlightPage(state, file, ctx) {
  const html = typeof file.content === 'string' ? file.content : file.content.toString('utf8');
  if (!html.includes('<pre')) return html;
  const fences = findFences(html);
  if (!fences.length) return html;

  const started = performance.now();
  const cacheDir = ctx.options?.cache ? resolve(ctx.source ?? process.cwd(), ctx.options.cache) : undefined;
  const locale = typeof file.metadata?.lang === 'string' ? file.metadata.lang : undefined;
  const stats = { rendered: 0, cached: 0, twoslash: 0, twoslashTime: 0 };

  const rendered = await Promise.all(
    fences.map(async (fence) => {
      if (!state.isKnownLanguage(fence.language)) {
        log('warn', `${file.path}: unknown language "${fence.language}", the fence is left as it is`);
        return undefined;
      }
      try {
        return await renderFence(state, fence, { path: file.path, locale, cacheDir, stats });
      } catch (error) {
        log('warn', `${file.path}: the ${fence.language || 'plain text'} fence could not be rendered, left as it is: ${error?.message ?? error}`);
        return undefined;
      }
    })
  );

  let output = '';
  let last = 0;
  fences.forEach((fence, i) => {
    if (rendered[i] === undefined) return;
    output += html.slice(last, fence.start) + rendered[i];
    last = fence.end;
  });
  output += html.slice(last);

  const twoslash = stats.twoslash ? `, ${stats.twoslash} twoslash in ${Math.round(stats.twoslashTime)} ms` : '';
  log('debug', `${file.path}: ${fences.length} fences (${stats.rendered} rendered, ${stats.cached} cached${twoslash}) in ${Math.round(performance.now() - started)} ms`);
  return output;
}

// ---------------------------------------------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------------------------------------------

// The engine loads while Douze sends the handshake and the first pages; a failure is fatal.
const engineReady = createEngine();
engineReady.then(
  (state) => log('debug', `engine ready in ${Math.round(state.loadTime)} ms (${state.engineVersion})`),
  fatal
);

serve(async (file, ctx) => highlightPage(await engineReady, file, ctx), {
  concurrency: availableParallelism(),
  name: 'code-worker',
});
