// Structural diff of two static site outputs (docs/douze-migration-plan.md, section 11.2): a reference build
// (today's Astro output, src/frontend/dist) and a candidate build (Douze's output).
//
//   node src/site/tests/parity/diff.mjs --reference src/frontend/dist --candidate <dir>
//        [--routes <file>] [--sample <n>] [--seed <n>] [--family <prefix or name>] [--text-only]
//        [--report <json file>] [--allow-differences] [--keep-dates] [--jobs <n>] [--top <n>]
//   node src/site/tests/parity/diff.mjs --dump <file.html|file.md> [--text-only] [--keep-dates]
//        prints what is extracted from one file, as JSON (to check the normalization).
//
// 1. Routes: every .html and .md file of both folders (`a/b/index.html` is `/a/b/`, `a/b.md` is `/a/b.md`), with
//    the missing (reference only) and extra (candidate only) routes counted per family (FAMILIES below).
// 2. Pages: every common route, or `--sample n` routes per family (seeded shuffle, `--seed`, default 12), plus every
//    route listed in `--routes` (one per line: `/a/b/`, `a/b/index.html`, `https://aspire.dev/a/b/`, `#` comments).
//    HTML pages compare, inside <main> (<body> without one): the text, the headings (level, id, text), the internal
//    link targets, the images (src, alt), the code blocks per language, the asides per kind, the steps, the tab
//    labels; and in <head>: title, description, og:title, og:description, og:image, canonical, hreflang alternates.
//    `.md` routes compare the heading list (outside fences) and the first line.
//    `--text-only` compares the text of <main> (the first line of `.md` routes) and nothing else.
// 3. Output: a console summary and, with `--report`, a JSON report listing every page with differences (worst
//    first, the first 3 differences of each kind with excerpts, and both file paths). The exit code is 1 when a
//    route is missing or a page differs, unless `--allow-differences`; 2 on usage errors.
//
// Normalization: only the features above are compared, so attributes such as `data-astro-*`, classes and
// generated ids (Expressive Code, tab panels) never count, except in fragment links where generated ids
// (`#tab-panel-6563`) become `#tab-panel-N`; <script>, <style> and <template> contents are skipped; hashed asset
// names (`/_astro/name.abc123.css`, `/assets/name.abc123.css`, also in route names) become `name.css`; entities are
// decoded and whitespace runs (nbsp included) collapse to one space, with block elements as word boundaries; the
// text of <time> elements (last updated and other dates) becomes `[date]` and the footer's build stamp
// (`SHA c26b59b`) becomes `SHA [commit]`, unless `--keep-dates`; the site origin
// (`--origin`, default https://aspire.dev) is stripped from links and image sources (not from meta tags).
//
// The HTML is read with a small purpose-built tokenizer rather than a DOM: the reference is 8 GB of HTML, and
// neither cheerio nor node-html-parser is installed (parse5 is only a transitive dependency). Files are processed
// one at a time in worker threads (`--jobs`, default: the CPU count); no tree is retained.

// Must be set before the first asynchronous file system call (listRoutes).
process.env.UV_THREADPOOL_SIZE ??= '16';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const KINDS = ['text', 'headings', 'links', 'images', 'code', 'asides', 'steps', 'tabs', 'meta'];
const MAX_DIFFS = 3;

// Families, first match wins: [name, test]. Route families are matched on the route with `.md` turned into `/`.
const LOCALES = ['da', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'uk', 'zh-cn'];
const OTHER_PREFIXES = ['/_astro/', '/i18n/', '/pagefind/', '/.well-known/'];
const OTHER_ROUTES = new Set(['/', '/index/', '/404.html', '/404/']);
const FAMILIES = [
  ['api-csharp', (r) => r.startsWith('/reference/api/csharp/')],
  ['api-typescript', (r) => r.startsWith('/reference/api/typescript/')],
  ...LOCALES.map((l) => [`locale-${l}`, (r) => r.startsWith(`/${l}/`)]),
  ['hub', (r) => r.startsWith('/hub/')],
  ['samples', (r) => r.startsWith('/reference/samples/')],
  ['og', (r) => r.startsWith('/og/')],
  ['other', (r) => OTHER_ROUTES.has(r) || OTHER_PREFIXES.some((p) => r.startsWith(p))],
  ['articles', () => true],
];
const FAMILY_PREFIX = {
  'api-csharp': '/reference/api/csharp/',
  'api-typescript': '/reference/api/typescript/',
  ...Object.fromEntries(LOCALES.map((l) => [`locale-${l}`, `/${l}/`])),
  hub: '/hub/',
  samples: '/reference/samples/',
  og: '/og/',
  other: '/, 404, _astro, i18n, .well-known',
  articles: '(the rest)',
};

function familyOf(route) {
  const r = route.endsWith('.md') ? route.slice(0, -3) + '/' : route;
  for (const [name, test] of FAMILIES) if (test(r)) return name;
  return 'articles';
}

// ---------------------------------------------------------------------------------------------------------------
// Normalization helpers

// `/_astro/name.CZiqdzJp_Z1ibTvo.svg` -> `/_astro/name.svg`. The hash has 5+ characters, at least one a digit or an
// uppercase letter, so `/assets/my.diagram.png` is kept.
const HASHED_ASSET =
  /((?:^|\/)(?:_astro|assets)\/(?:[^"'\s?#)]*\/)?)([^/"'\s?#)]+?)\.(?=[A-Za-z_-]*[0-9A-Z])([A-Za-z0-9_-]{5,})\.([A-Za-z0-9]+)(?=[?#"'\s)]|$)/g;
const unhash = (s) => (s.includes('_astro/') || s.includes('assets/') ? s.replace(HASHED_ASSET, '$1$2.$4') : s);

// The footer's build stamp, `SHA c26b59b`.
const COMMIT_STAMP = /\b(SHA:? )[0-9a-f]{7,40}\b/g;

const GENERATED_FRAGMENT = /#(tab-panel|tab|dropdown|ec|tooltip|popover|twoslash)-\d+\b/g;

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  times: '×',
  rarr: '→',
  larr: '←',
  middot: '·',
  bull: '•',
  zwj: '‍',
  zwnj: '‌',
  shy: '',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
};
const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;
function decodeEntities(s) {
  return s.replace(ENTITY, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    const v = NAMED[e];
    return v === undefined ? m : v;
  });
}
function normText(s) {
  if (s.includes('&')) s = decodeEntities(s);
  return s.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Tokenizer: calls h.text(html, start, end), h.open(name, attrStart, attrEnd, selfClosing), h.close(name).
// Skips comments, doctype, <script> and <style> contents; <title> and <textarea> contents are text.

function isNameChar(c) {
  return (
    (c >= 97 && c <= 122) ||
    (c >= 65 && c <= 90) ||
    (c >= 48 && c <= 57) ||
    c === 45 ||
    c === 58 ||
    c === 95 ||
    c === 46
  );
}
function tagEnd(html, k, end) {
  let prev = 0;
  while (k < end) {
    const ch = html.charCodeAt(k);
    if (ch === 62) return k;
    if ((ch === 34 || ch === 39) && prev === 61) {
      const q = html.indexOf(ch === 34 ? '"' : "'", k + 1);
      if (q === -1 || q >= end) return end;
      k = q + 1;
      prev = ch;
      continue;
    }
    if (ch !== 32 && ch !== 10 && ch !== 9 && ch !== 13) prev = ch;
    k++;
  }
  return end;
}
function closeOf(html, name, from, end) {
  let e = html.indexOf('</' + name, from);
  if (e === -1) e = html.indexOf('</' + name.toUpperCase(), from);
  return e === -1 || e > end ? end : e;
}

function scan(html, start, end, h) {
  let i = start;
  while (i < end) {
    let lt = html.indexOf('<', i);
    if (lt === -1 || lt > end) lt = end;
    if (lt > i) h.text(html, i, lt);
    if (lt >= end) break;
    const c = html.charCodeAt(lt + 1);
    if (c === 33) {
      // <!-- -->, <![CDATA[ ]]>, <!doctype>
      if (html.startsWith('<!--', lt)) {
        const e = html.indexOf('-->', lt + 4);
        i = e === -1 ? end : e + 3;
      } else if (html.startsWith('<![CDATA[', lt)) {
        const e = html.indexOf(']]>', lt + 9);
        h.text(html, lt + 9, e === -1 ? end : e);
        i = e === -1 ? end : e + 3;
      } else {
        const e = html.indexOf('>', lt);
        i = e === -1 ? end : e + 1;
      }
      continue;
    }
    if (c === 47) {
      let k = lt + 2;
      while (k < end && isNameChar(html.charCodeAt(k))) k++;
      const e = html.indexOf('>', k);
      i = e === -1 ? end : e + 1;
      if (k > lt + 2) h.close(html.slice(lt + 2, k).toLowerCase());
      continue;
    }
    if (!((c >= 97 && c <= 122) || (c >= 65 && c <= 90))) {
      h.text(html, lt, lt + 1);
      i = lt + 1;
      continue;
    }
    let k = lt + 2;
    while (k < end && isNameChar(html.charCodeAt(k))) k++;
    const name = html.slice(lt + 1, k).toLowerCase();
    const te = tagEnd(html, k, end);
    const selfClosing = html.charCodeAt(te - 1) === 47;
    i = te + 1;
    if (selfClosing) {
      h.open(name, k, te - 1, true);
      continue;
    }
    if (name === 'script' || name === 'style') {
      const e = closeOf(html, name, i, end);
      const g = html.indexOf('>', e);
      i = g === -1 || e >= end ? end : g + 1;
      continue;
    }
    h.open(name, k, te, false);
    if (name === 'title' || name === 'textarea') {
      const e = closeOf(html, name, i, end);
      if (e > i) h.text(html, i, e);
      i = e;
    }
  }
}

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function attrs(html, s, e) {
  const out = {};
  if (s >= e) return out;
  const str = html.slice(s, e);
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(str))) {
    const v = m[2] ?? m[3] ?? m[4];
    const name = m[1].toLowerCase();
    if (!(name in out)) out[name] = v === undefined ? '' : v.includes('&') ? decodeEntities(v) : v;
  }
  return out;
}

const BLOCK = new Set(
  (
    'address article aside blockquote body br dd details dialog div dl dt fieldset figcaption figure footer form ' +
    'h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section summary table tbody td tfoot th thead tr ul ' +
    'option select caption legend starlight-tabs starlight-tabs-restore iframe video audio canvas img'
  ).split(' ')
);

function findTag(html, name, from = 0) {
  let i = html.indexOf('<' + name, from);
  while (i !== -1) {
    const c = html.charCodeAt(i + 1 + name.length);
    if (c === 62 || c === 32 || c === 10 || c === 9 || c === 13 || c === 47) return i;
    i = html.indexOf('<' + name, i + 1);
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------------------------
// Extraction

function extractHtml(html, opt) {
  const { textOnly, keepDates, origin } = opt;
  // Content range: <main> (first open tag to last close tag), else <body>, else everything after </head>.
  let start, end;
  const m = findTag(html, 'main');
  if (m !== -1) {
    start = tagEnd(html, m + 5, html.length) + 1;
    end = html.lastIndexOf('</main');
    if (end < start) end = html.length;
  } else {
    const b = findTag(html, 'body');
    if (b !== -1) {
      start = tagEnd(html, b + 5, html.length) + 1;
      end = html.lastIndexOf('</body');
      if (end < start) end = html.length;
    } else {
      const he = html.indexOf('</head>');
      start = he === -1 ? 0 : he + 7;
      end = html.length;
    }
  }

  const chunks = [];
  const out = { text: '', headings: [], links: [], images: [], code: {}, asides: {}, steps: 0, tabs: [], meta: null };
  let templateDepth = 0;
  let timeDepth = 0;
  let heading = null; // { tag, level, id, at }
  let tab = null; // { tag, at }
  let pendingPre = false;

  const internalHref = (href) => {
    if (href == null) return null;
    let h = href.trim();
    if (!h || /^(mailto|tel|javascript|data):/i.test(h)) return null;
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(h)) {
      if (h.startsWith(origin + '/') || h === origin) h = h.slice(origin.length) || '/';
      else return null;
    }
    return unhash(h).replace(GENERATED_FRAGMENT, '#$1-N');
  };
  const src = (s) => {
    if (s == null) return '[no src]';
    let v = s.trim();
    if (v.startsWith(origin + '/')) v = v.slice(origin.length);
    return unhash(v);
  };
  const bump = (map, key) => (map[key] = (map[key] || 0) + 1);
  const textSince = (at) => normText(chunks.slice(at).join(''));

  const h = {
    text(s, a, b) {
      if (templateDepth || timeDepth) return;
      chunks.push(s.slice(a, b));
    },
    open(name, a, b, selfClosing) {
      if (templateDepth) {
        if (name === 'template' && !selfClosing) templateDepth++;
        return;
      }
      if (name === 'template' && !selfClosing) {
        templateDepth = 1;
        return;
      }
      if (BLOCK.has(name)) chunks.push(' ');
      if (name === 'time' && !keepDates && !selfClosing) {
        if (timeDepth++ === 0) chunks.push('[date]');
        return;
      }
      if (textOnly) return;
      if (pendingPre) {
        pendingPre = false;
        let lang = 'plain';
        if (name === 'code') {
          const lm = /(?:^|\s)lang(?:uage)?-(\S+)/.exec(attrs(html, a, b).class || '');
          if (lm) lang = lm[1];
        }
        bump(out.code, lang);
      }
      const c0 = name.charCodeAt(0);
      if (c0 === 104 && name.length === 2 && name.charCodeAt(1) >= 49 && name.charCodeAt(1) <= 54) {
        const at = attrs(html, a, b);
        heading = { tag: name, id: at.id ?? '', at: chunks.length };
      } else if (name === 'a') {
        const at = attrs(html, a, b);
        const href = internalHref(at.href);
        if (href !== null) out.links.push(href);
        if (at.role === 'tab') tab = { tag: 'a', at: chunks.length };
      } else if (name === 'button') {
        const at = attrs(html, a, b);
        if (at.role === 'tab') tab = { tag: 'button', at: chunks.length };
      } else if (name === 'img') {
        const at = attrs(html, a, b);
        out.images.push(`${src(at.src)} alt=${at.alt === undefined ? '[none]' : JSON.stringify(normText(at.alt))}`);
      } else if (name === 'pre') {
        const at = attrs(html, a, b);
        const cls = at.class || '';
        let lang = at['data-language'] || at['data-lang'] || (/(?:^|\s)lang(?:uage)?-(\S+)/.exec(cls) || [])[1];
        if (!lang && /(?:^|\s)mermaid(?:\s|$)/.test(cls)) lang = 'mermaid';
        if (lang) bump(out.code, lang);
        else pendingPre = true;
      } else if (name === 'aside') {
        const at = attrs(html, a, b);
        const km = /starlight-aside--(\S+)/.exec(at.class || '');
        bump(out.asides, km ? km[1] : at['aria-label'] || 'aside');
      } else if (name === 'ol' || name === 'div') {
        // Starlight's <Steps> renders <ol class="sl-steps">; only parse when the tag can hold it.
        if (b - a > 8 && html.slice(a, b).includes('sl-steps')) {
          if (/(?:^|\s)sl-steps(?:\s|$)/.test(attrs(html, a, b).class || '')) out.steps++;
        }
      }
    },
    close(name) {
      if (templateDepth) {
        if (name === 'template') templateDepth--;
        return;
      }
      if (name === 'time' && timeDepth) {
        timeDepth--;
        return;
      }
      if (BLOCK.has(name)) chunks.push(' ');
      if (textOnly) return;
      if (pendingPre && name === 'pre') {
        pendingPre = false;
        bump(out.code, 'plain');
      }
      if (heading && name === heading.tag) {
        out.headings.push(`${heading.tag}#${heading.id} ${textSince(heading.at)}`);
        heading = null;
      } else if (tab && name === tab.tag) {
        out.tabs.push(textSince(tab.at));
        tab = null;
      }
    },
  };
  scan(html, start, end, h);
  out.text = normText(chunks.join(''));
  if (!keepDates) out.text = out.text.replace(COMMIT_STAMP, '$1[commit]');

  if (!textOnly) {
    const meta = {
      title: null,
      description: null,
      'og:title': null,
      'og:description': null,
      'og:image': null,
      canonical: null,
      hreflang: [],
    };
    let headEnd = html.indexOf('</head>');
    if (headEnd === -1) headEnd = m !== -1 ? m : html.length;
    let titleAt = -1;
    const mc = [];
    scan(html, 0, headEnd, {
      text(s, a, b) {
        if (titleAt !== -1) mc.push(s.slice(a, b));
      },
      open(name, a, b) {
        if (name === 'title') {
          if (meta.title === null) titleAt = 0;
        } else if (name === 'meta') {
          const at = attrs(html, a, b);
          const key = (at.property || at.name || '').toLowerCase();
          if (key in meta && key !== 'canonical' && key !== 'hreflang' && key !== 'title' && meta[key] === null) {
            meta[key] = normText(key === 'og:image' ? unhash(at.content ?? '') : (at.content ?? ''));
          }
        } else if (name === 'link') {
          const at = attrs(html, a, b);
          const rel = (at.rel || '').toLowerCase().split(/\s+/);
          if (rel.includes('canonical') && meta.canonical === null) meta.canonical = (at.href ?? '').trim();
          else if (rel.includes('alternate') && at.hreflang)
            meta.hreflang.push(`${at.hreflang} ${(at.href ?? '').trim()}`);
        }
      },
      close(name) {
        if (name === 'title' && titleAt !== -1) {
          meta.title = normText(mc.join(''));
          titleAt = -1;
        }
      },
    });
    meta.hreflang.sort();
    out.meta = meta;
  }
  return out;
}

function extractMd(src) {
  const lines = src.split(/\r?\n/);
  let firstLine = '';
  for (const l of lines) {
    if (l.trim()) {
      firstLine = normText(l);
      break;
    }
  }
  const headings = [];
  let fence = null;
  for (const l of lines) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(l);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && !l.trim().slice(f[1].length).trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const hm = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(l);
    if (hm) headings.push(`h${hm[1].length} ${normText(hm[2])}`);
  }
  return { firstLine, headings };
}

// ---------------------------------------------------------------------------------------------------------------
// Diffs

// Greedy sequence diff: returns { count, hunks } with the first `limit` hunks ({ ai, bi, del, ins }). A hunk ends
// at the nearest point where the sequences agree again for 3 items (or to their end), searched within `window`.
function seqDiff(a, b, limit = MAX_DIFFS, window = 120, maxCount = 1000) {
  const hunks = [];
  let count = 0;
  let i = 0;
  let j = 0;
  let ea = a.length;
  let eb = b.length;
  while (ea > 0 && eb > 0 && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  const agree = (x, y) => {
    for (let k = 0; k < 3; k++) {
      if (x + k >= ea || y + k >= eb) return k > 0 || (x >= ea && y >= eb);
      if (a[x + k] !== b[y + k]) return false;
    }
    return true;
  };
  while (i < ea || j < eb) {
    if (i < ea && j < eb && a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    let dx = ea - i;
    let dy = eb - j;
    search: for (let s = 1; s <= 2 * window; s++) {
      for (let x = Math.max(0, s - window); x <= Math.min(s, window); x++) {
        const y = s - x;
        if (i + x > ea || j + y > eb) continue;
        if ((i + x === ea && j + y === eb) || (i + x < ea && j + y < eb && agree(i + x, j + y))) {
          dx = x;
          dy = y;
          break search;
        }
      }
    }
    count++;
    if (hunks.length < limit) hunks.push({ ai: i, bi: j, del: a.slice(i, i + dx), ins: b.slice(j, j + dy) });
    i += dx;
    j += dy;
    if (count >= maxCount) break;
  }
  return { count, hunks };
}

const clip = (s, n = 160) => (s.length > n ? s.slice(0, n) + '…' : s);

function textDiff(a, b) {
  const wa = a ? a.split(' ') : [];
  const wb = b ? b.split(' ') : [];
  const { count, hunks } = seqDiff(wa, wb);
  const ctx = 8;
  return {
    count,
    diffs: hunks.map((hk) => {
      const before = clip(wa.slice(Math.max(0, hk.ai - ctx), hk.ai).join(' '), 80);
      const afterA = clip(wa.slice(hk.ai + hk.del.length, hk.ai + hk.del.length + ctx).join(' '), 80);
      const afterB = clip(wb.slice(hk.bi + hk.ins.length, hk.bi + hk.ins.length + ctx).join(' '), 80);
      return {
        word: hk.ai,
        reference: `…${before} [${clip(hk.del.join(' '))}] ${afterA}…`,
        candidate: `…${before} [${clip(hk.ins.join(' '))}] ${afterB}…`,
      };
    }),
  };
}

function listDiff(a, b) {
  const { count, hunks } = seqDiff(a, b);
  return {
    count,
    diffs: hunks.map((hk) => ({
      index: hk.ai,
      reference: hk.del
        .slice(0, 5)
        .map((x) => clip(x))
        .concat(hk.del.length > 5 ? [`… ${hk.del.length - 5} more`] : []),
      candidate: hk.ins
        .slice(0, 5)
        .map((x) => clip(x))
        .concat(hk.ins.length > 5 ? [`… ${hk.ins.length - 5} more`] : []),
    })),
  };
}

function mapDiff(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const diffs = keys.filter((k) => (a[k] || 0) !== (b[k] || 0)).map((k) => `${k}: ${a[k] || 0} -> ${b[k] || 0}`);
  return { count: diffs.length, diffs: diffs.slice(0, MAX_DIFFS) };
}

function metaDiff(a, b) {
  const diffs = [];
  for (const k of Object.keys(a)) {
    if (k === 'hreflang') continue;
    if (a[k] !== b[k])
      diffs.push({
        tag: k,
        reference: a[k] === null ? null : clip(a[k]),
        candidate: b[k] === null ? null : clip(b[k]),
      });
  }
  const sb = new Set(b.hreflang);
  const sa = new Set(a.hreflang);
  const missing = a.hreflang.filter((x) => !sb.has(x));
  const extra = b.hreflang.filter((x) => !sa.has(x));
  if (missing.length || extra.length)
    diffs.push({ tag: 'hreflang', missing: missing.slice(0, 5), extra: extra.slice(0, 5) });
  return { count: diffs.length, diffs: diffs.slice(0, MAX_DIFFS) };
}

function comparePage(item, opt) {
  const kinds = {};
  const diffs = {};
  const add = (kind, r) => {
    if (r.count) {
      kinds[kind] = (kinds[kind] || 0) + r.count;
      diffs[kind] = (diffs[kind] || []).concat(r.diffs).slice(0, MAX_DIFFS);
    }
  };
  const ra = fs.readFileSync(item.ref, 'utf8');
  const rb = fs.readFileSync(item.cand, 'utf8');
  if (item.route.endsWith('.md')) {
    const a = extractMd(ra);
    const b = extractMd(rb);
    if (a.firstLine !== b.firstLine)
      add('text', { count: 1, diffs: [{ line: 1, reference: clip(a.firstLine), candidate: clip(b.firstLine) }] });
    if (!opt.textOnly) add('headings', listDiff(a.headings, b.headings));
  } else {
    const a = extractHtml(ra, opt);
    const b = extractHtml(rb, opt);
    if (a.text !== b.text) add('text', textDiff(a.text, b.text));
    if (!opt.textOnly) {
      add('headings', listDiff(a.headings, b.headings));
      add('links', listDiff(a.links, b.links));
      add('images', listDiff(a.images, b.images));
      add('code', mapDiff(a.code, b.code));
      add('asides', mapDiff(a.asides, b.asides));
      if (a.steps !== b.steps) add('steps', { count: 1, diffs: [`${a.steps} -> ${b.steps}`] });
      add('tabs', listDiff(a.tabs, b.tabs));
      add('meta', metaDiff(a.meta, b.meta));
    }
  }
  return { route: item.route, family: item.family, kinds, diffs };
}

// ---------------------------------------------------------------------------------------------------------------
// Main

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`);
  console.error(
    'usage: node src/site/tests/parity/diff.mjs --reference <dir> --candidate <dir> [--routes <file>] [--sample <n>]\n' +
      '         [--seed <n>] [--family <prefix|name>] [--text-only] [--report <json file>] [--allow-differences]\n' +
      '         [--keep-dates] [--origin <url>] [--jobs <n>] [--top <n>]'
  );
  process.exit(2);
}

function parseArgs(argv) {
  const o = {
    sample: 0,
    seed: 12,
    textOnly: false,
    allowDifferences: false,
    keepDates: false,
    origin: 'https://aspire.dev',
    jobs: os.availableParallelism(),
    top: 10,
  };
  const flags = { '--text-only': 'textOnly', '--allow-differences': 'allowDifferences', '--keep-dates': 'keepDates' };
  const values = {
    '--reference': 'reference',
    '--candidate': 'candidate',
    '--routes': 'routes',
    '--sample': 'sample',
    '--seed': 'seed',
    '--report': 'report',
    '--family': 'family',
    '--origin': 'origin',
    '--jobs': 'jobs',
    '--top': 'top',
  };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let v;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq !== -1) {
      v = a.slice(eq + 1);
      a = a.slice(0, eq);
    }
    if (a === '--help' || a === '-h') usage();
    if (flags[a]) o[flags[a]] = true;
    else if (values[a]) {
      if (v === undefined) v = argv[++i];
      if (v === undefined) usage(`${a} needs a value`);
      o[values[a]] = v;
    } else usage(`unknown argument ${a}`);
  }
  for (const k of ['sample', 'seed', 'jobs', 'top']) {
    o[k] = Number(o[k]);
    if (!Number.isInteger(o[k]) || o[k] < 0) usage(`--${k} must be a non negative integer`);
  }
  if (!o.reference || !o.candidate) usage('--reference and --candidate are required');
  o.origin = o.origin.replace(/\/+$/, '');
  return o;
}

// Every .html and .md file under root: Map route -> absolute path. Directories are read concurrently (64 at a time,
// on a 16 thread libuv pool, see the top of the file): about 0.8 s for the 34k folders of the reference.
function listRoutes(root) {
  const files = [];
  const queue = [''];
  let active = 0;
  return new Promise((resolve, reject) => {
    const pump = () => {
      while (active < 64 && queue.length) {
        const rel = queue.pop();
        active++;
        fs.promises.readdir(path.join(root, rel), { withFileTypes: true }).then((entries) => {
          for (const e of entries) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) queue.push(r);
            else if (e.name.endsWith('.html') || e.name.endsWith('.md')) files.push(r);
          }
          active--;
          if (!active && !queue.length) {
            files.sort();
            resolve(new Map(files.map((r) => [toRoute(r), path.join(root, r)])));
          } else pump();
        }, reject);
      }
    };
    pump();
  });
}
function toRoute(rel) {
  let r = '/' + rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (r.endsWith('/index.html')) r = r.slice(0, -'index.html'.length);
  return unhash(r);
}
function normRouteArg(line, origin) {
  let r = line.trim();
  if (r.startsWith(origin)) r = r.slice(origin.length);
  r = r.replace(/[?#].*$/, '');
  if (!r.startsWith('/')) r = '/' + r;
  if (r.endsWith('/index.html')) r = r.slice(0, -'index.html'.length);
  if (!r.endsWith('/') && !r.endsWith('.html') && !r.endsWith('.md')) r += '/';
  return unhash(r);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

async function main() {
  const t0 = performance.now();
  const argv = process.argv.slice(2);
  const di = argv.indexOf('--dump');
  if (di !== -1) {
    const file = argv[di + 1];
    if (!file) usage('--dump needs a file');
    const opt = {
      textOnly: argv.includes('--text-only'),
      keepDates: argv.includes('--keep-dates'),
      origin: 'https://aspire.dev',
    };
    const src = fs.readFileSync(file, 'utf8');
    console.log(JSON.stringify(file.endsWith('.md') ? extractMd(src) : extractHtml(src, opt), null, 2));
    return;
  }
  const o = parseArgs(argv);
  for (const k of ['reference', 'candidate']) {
    o[k] = path.resolve(o[k]);
    if (!fs.existsSync(o[k]) || !fs.statSync(o[k]).isDirectory()) usage(`${k} folder ${o[k]} does not exist`);
  }
  const inScope = o.family
    ? o.family.startsWith('/')
      ? (route) => route.startsWith(o.family) || (route.endsWith('.md') && route.slice(0, -3) + '/' === o.family)
      : (route) => familyOf(route) === o.family
    : () => true;
  if (o.family && !o.family.startsWith('/') && !FAMILIES.some(([n]) => n === o.family)) {
    usage(`unknown family ${o.family} (families: ${FAMILIES.map(([n]) => n).join(', ')})`);
  }

  // 1. Route sets
  const [ref, cand] = await Promise.all([listRoutes(o.reference), listRoutes(o.candidate)]);
  const tList = performance.now();
  const fam = {};
  const famRow = (f) =>
    (fam[f] ??= {
      reference: 0,
      candidate: 0,
      common: 0,
      missing: 0,
      extra: 0,
      compared: 0,
      identical: 0,
      differing: 0,
    });
  for (const [n] of FAMILIES) famRow(n);
  const missing = [];
  const extra = [];
  const common = [];
  for (const r of ref.keys()) {
    if (!inScope(r)) continue;
    const row = famRow(familyOf(r));
    row.reference++;
    if (cand.has(r)) {
      row.common++;
      common.push(r);
    } else {
      row.missing++;
      missing.push(r);
    }
  }
  for (const r of cand.keys()) {
    if (!inScope(r)) continue;
    const row = famRow(familyOf(r));
    row.candidate++;
    if (!ref.has(r)) {
      row.extra++;
      extra.push(r);
    }
  }
  missing.sort();
  extra.sort();
  common.sort();

  // 2. Pages to compare
  let selected;
  const listed = [];
  if (o.routes) {
    for (const line of fs.readFileSync(o.routes, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const r = normRouteArg(line, o.origin);
      if (inScope(r)) listed.push(r);
    }
  }
  if (o.sample > 0) {
    const set = new Set();
    const byFam = {};
    for (const r of common) (byFam[familyOf(r)] ??= []).push(r);
    const rnd = mulberry32(o.seed);
    for (const f of Object.keys(byFam).sort()) {
      const arr = byFam[f].slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      for (const r of arr.slice(0, o.sample)) set.add(r);
    }
    const unlisted = [];
    for (const r of listed) {
      if (ref.has(r) && cand.has(r)) set.add(r);
      else unlisted.push(r);
    }
    if (unlisted.length)
      console.warn(
        `warning: ${unlisted.length} listed route(s) not in both outputs, e.g. ${unlisted.slice(0, 3).join(', ')}`
      );
    selected = [...set].sort();
  } else {
    selected = common;
    const notCommon = listed.filter((r) => !(ref.has(r) && cand.has(r)));
    if (notCommon.length)
      console.warn(
        `warning: ${notCommon.length} listed route(s) not in both outputs, e.g. ${notCommon.slice(0, 3).join(', ')}`
      );
  }

  // 3. Compare in workers
  const items = selected.map((r) => ({ route: r, family: familyOf(r), ref: ref.get(r), cand: cand.get(r) }));
  const results = [];
  if (items.length) {
    const opt = { textOnly: o.textOnly, keepDates: o.keepDates, origin: o.origin };
    const jobs = Math.max(1, Math.min(o.jobs || 1, Math.ceil(items.length / 8)));
    const batchSize = Math.max(1, Math.min(32, Math.ceil(items.length / (jobs * 4))));
    let next = 0;
    const showProgress = process.stderr.isTTY;
    let done = 0;
    await Promise.all(
      Array.from(
        { length: jobs },
        () =>
          new Promise((resolve, reject) => {
            const w = new Worker(new URL(import.meta.url), { workerData: opt });
            const feed = () => {
              if (next >= items.length) {
                w.terminate().then(resolve, reject);
                return;
              }
              w.postMessage(items.slice(next, next + batchSize));
              next += batchSize;
            };
            w.on('message', (res) => {
              for (const r of res) results.push(r);
              done += res.length;
              if (showProgress) process.stderr.write(`\rcompared ${done}/${items.length}`);
              feed();
            });
            w.on('error', reject);
            feed();
          })
      )
    );
    if (showProgress) process.stderr.write('\r\x1b[K');
  }

  // 4. Aggregate
  const byKind = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const differing = [];
  const errors = [];
  let identical = 0;
  for (const r of results) {
    const row = famRow(r.family);
    row.compared++;
    if (r.identical) {
      row.identical++;
      identical++;
    } else if (r.error) {
      row.differing++;
      errors.push(r);
    } else {
      row.differing++;
      for (const k of Object.keys(r.kinds)) byKind[k]++;
      r.score = Object.values(r.kinds).reduce((s, n) => s + Math.min(n, 100), 0);
      differing.push(r);
    }
  }
  differing.sort(
    (a, b) =>
      b.score - a.score || Object.keys(b.kinds).length - Object.keys(a.kinds).length || (a.route < b.route ? -1 : 1)
  );
  errors.sort((a, b) => (a.route < b.route ? -1 : 1));
  const elapsed = (performance.now() - t0) / 1000;

  // Console summary
  const fams = Object.keys(fam).filter((f) => fam[f].reference || fam[f].candidate);
  const tot = { reference: 0, candidate: 0, common: 0, missing: 0, extra: 0, compared: 0, identical: 0, differing: 0 };
  for (const f of fams) for (const k of Object.keys(tot)) tot[k] += fam[f][k];
  const line = (name, prefix, r) =>
    `${pad(name, 17)}${pad(prefix, 29)}${lpad(r.reference, 8)}${lpad(r.candidate, 10)}${lpad(r.missing, 9)}${lpad(r.extra, 7)}${lpad(r.compared, 10)}${lpad(r.identical, 11)}${lpad(r.differing, 11)}`;
  console.log(
    `reference ${o.reference}\ncandidate ${o.candidate}${o.textOnly ? '\nmode      text only' : ''}${o.family ? `\nfamily    ${o.family}` : ''}\n`
  );
  console.log(
    `${pad('family', 17)}${pad('prefix', 29)}${lpad('ref', 8)}${lpad('cand', 10)}${lpad('missing', 9)}${lpad('extra', 7)}${lpad('compared', 10)}${lpad('identical', 11)}${lpad('differing', 11)}`
  );
  for (const f of fams) console.log(line(f, FAMILY_PREFIX[f] ?? '', fam[f]));
  console.log(line('total', '', tot));
  console.log(
    `\nroutes: ${ref.size} in the reference, ${cand.size} in the candidate (${tot.missing} missing, ${tot.extra} extra${o.family ? ' in scope' : ''})`
  );
  if (missing.length) console.log(`  missing, e.g. ${missing.slice(0, 5).join(', ')}`);
  if (extra.length) console.log(`  extra, e.g. ${extra.slice(0, 5).join(', ')}`);
  console.log(
    `pages: ${results.length} compared, ${identical} identical, ${differing.length + errors.length} with differences`
  );
  const kindsShown = o.textOnly ? ['text'] : KINDS;
  console.log(
    `  by kind: ${kindsShown.map((k) => `${k} ${byKind[k]}`).join(', ')}${errors.length ? `, errors ${errors.length}` : ''}`
  );
  if (differing.length) {
    console.log(`\nworst pages:`);
    for (const r of differing.slice(0, o.top)) {
      console.log(
        `  ${r.route}  ${Object.entries(r.kinds)
          .map(([k, n]) => `${k}:${n >= 1000 ? '1000+' : n}`)
          .join(' ')}`
      );
    }
  }
  for (const e of errors.slice(0, 5)) console.log(`error ${e.route}: ${e.error.split('\n')[0]}`);
  console.log(`\ntime: ${elapsed.toFixed(1)} s (listing ${((tList - t0) / 1000).toFixed(1)} s)`);

  if (o.report) {
    const report = {
      reference: o.reference,
      candidate: o.candidate,
      options: {
        textOnly: o.textOnly,
        sample: o.sample,
        seed: o.seed,
        family: o.family ?? null,
        routes: o.routes ?? null,
        keepDates: o.keepDates,
        origin: o.origin,
      },
      seconds: Number(elapsed.toFixed(1)),
      routes: {
        totals: { reference: ref.size, candidate: cand.size, missing: tot.missing, extra: tot.extra },
        families: Object.fromEntries(fams.map((f) => [f, { prefix: FAMILY_PREFIX[f], ...fam[f] }])),
        missing,
        extra,
      },
      pages: { compared: results.length, identical, differing: differing.length, errors: errors.length, byKind },
      differences: differing.map(({ route, family, score, kinds, diffs, ref: rf, cand: cf }) => ({
        route,
        family,
        score,
        kinds,
        reference: rf,
        candidate: cf,
        diffs,
      })),
      errors,
    };
    fs.mkdirSync(path.dirname(path.resolve(o.report)), { recursive: true });
    fs.writeFileSync(o.report, JSON.stringify(report, null, 2) + '\n');
    console.log(`report: ${path.resolve(o.report)}`);
  }

  const failed = tot.missing > 0 || differing.length > 0 || errors.length > 0;
  process.exitCode = failed && !o.allowDifferences ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Entry point: the main thread lists and schedules, workers compare (declared last: main uses every const above).

if (!isMainThread) {
  const opt = workerData;
  parentPort.on('message', (batch) => {
    const results = [];
    for (const item of batch) {
      try {
        const r = comparePage(item, opt);
        if (Object.keys(r.kinds).length) results.push({ ...r, ref: item.ref, cand: item.cand });
        else results.push({ route: item.route, family: item.family, identical: true });
      } catch (e) {
        results.push({
          route: item.route,
          family: item.family,
          error: String(e && e.stack ? e.stack : e),
          ref: item.ref,
          cand: item.cand,
        });
      }
    }
    parentPort.postMessage(results);
  });
} else {
  await main();
}
