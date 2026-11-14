// Compares the code blocks of two builds of the site, page by page and block by block: the native `highlight` step's
// against the Node worker's (or any two), over every page that has code blocks.
//
//   node src/site/tests/parity/code-blocks.mjs <input> <reference> <candidate> <report.json> [--english]
//
// <input> is a build without highlighting (`enabled: false` on both `highlight` and `code` in douze.yml): its
// fences tell which blocks come from Markdown fences, the Expressive Code blocks it already has (written by templates)
// are left out. Each pair of blocks is:
//   identical    the same bytes;
//   equivalent   the same elements, attributes (classes and style declarations in any order) and text, and the same
//                token style (the --0/--1 variables) on every character: only the boundaries of the token spans, the
//                escaping of characters and the color of white space differ (none shows);
//   colors       the same markup, some character styled differently;
//   markup       anything else.
// The report lists the first 3,000 blocks of the last two kinds, with both blocks and their normalized structure.
// The API reference (no code blocks) is skipped. --english leaves the locale folders out.
import fs from 'node:fs';
import path from 'node:path';
const [inDir, refDir, candDir, reportFile] = process.argv.slice(2);
const english = process.argv.includes('--english');
const LOCALES = new Set(['da', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'uk', 'zh-cn']);
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const dec = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, n) => n[0] === '#' ? String.fromCodePoint(n[1] === 'x' || n[1] === 'X' ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10)) : ENT[n.toLowerCase()] ?? m);
function* walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!p.endsWith('reference/api')) yield* walk(p); } else if (e.name.endsWith('.html')) yield p; } }
function blocks(html) {
  const out = []; let i = 0;
  while ((i = html.indexOf('<div class="expressive-code"', i)) !== -1) {
    let depth = 0, j = i; const re = /<(\/?)div\b[^>]*>/g; re.lastIndex = i; let m;
    while ((m = re.exec(html))) { depth += m[1] ? -1 : 1; if (depth === 0) { j = re.lastIndex; break; } }
    out.push(html.slice(i, j)); i = j;
  }
  return out;
}
function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] }; const stack = [root];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|(<)/g; let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined || m[6]) { top.children.push({ text: dec(m[5] ?? '<') }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) { for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === tag) { stack.length = k; break; } continue; }
    const attrs = {}; for (const a of m[3].matchAll(/([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = dec(a[2] ?? a[3] ?? a[4] ?? '');
    const node = { tag, attrs, children: [] }; top.children.push(node);
    if (!m[4] && !VOID.has(tag)) stack.push(node);
  }
  return root;
}
const isToken = (n) => n.tag === 'span' && !n.attrs.class && (n.attrs.style ?? '').startsWith('--');
const parseStyle = (s) => Object.fromEntries((s ?? '').split(';').filter(Boolean).map((d) => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim().toLowerCase()]; }));
// structure: tags, attributes (sorted; style declarations sorted) and text, token spans removed, adjacent texts merged.
// styles: for each character of text, its effective token style.
function canon(node, vars, out) {
  for (let c of node.children) {
    // White space shows no color or font style, only an underline or a background.
    if (c.text !== undefined) { out.text += c.text; out.styles.push(...[...c.text].map((ch) => /\s/.test(ch) ? visibleOnSpace(vars) : vars)); continue; }
    if (isToken(c)) { const v = { ...JSON.parse(vars || '{}'), ...parseStyle(c.attrs.style) }; canon(c, JSON.stringify(Object.fromEntries(Object.entries(v).sort())), out); continue; }
    flush(out);
    // Inert: a class span's style variables (the hovered token's, copied on the twoslash wrapper).
    if (c.tag === 'span' && (c.attrs.class ?? '').split(/\s+/).includes('twoslash') && (c.attrs.style ?? '').startsWith('--')) { c = { ...c, attrs: { ...c.attrs } }; delete c.attrs.style; }
    const attrs = Object.entries(c.attrs).map(([k, v]) => [k, k === 'style' ? v.split(';').map((x) => x.trim().replace(/\s*:\s*/, ':')).filter(Boolean).sort().join(';') : k === 'class' ? v.split(/\s+/).filter(Boolean).sort().join(' ') : v]).sort();
    out.parts.push(`<${c.tag}${attrs.map(([k, v]) => ` ${k}="${v}"`).join('')}>`);
    canon(c, '', out); flush(out); out.parts.push(`</${c.tag}>`);
  }
}
function visibleOnSpace(vars) { if (!vars) return ''; const v = JSON.parse(vars); const kept = Object.entries(v).filter(([k]) => /td$|bg$/.test(k)); return kept.length ? JSON.stringify(Object.fromEntries(kept)) : ''; }
function flush(out) { if (out.text) { out.parts.push(JSON.stringify(out.text)); out.styleParts.push(out.styles.join('|')); out.chars.push(...[...out.text].map((ch, i) => [ch, out.styles[i]])); out.text = ''; out.styles = []; } }
function analyze(html) { const out = { parts: [], styleParts: [], chars: [], text: '', styles: [] }; canon(parse(html), '', out); flush(out); return { structure: out.parts.join(''), styles: out.styleParts.join('\n'), chars: out.chars }; }

const counts = { blocks: 0, identical: 0, equivalent: 0, colors: 0, markup: 0, missing: 0 };
const unique = new Map();
const examples = { colors: [], markup: [] };
for (const file of walk(candDir)) {
  const rel = path.relative(candDir, file);
  if (english && LOCALES.has(rel.split(path.sep)[0])) continue;
  const inPath = path.join(inDir, rel), refPath = path.join(refDir, rel);
  if (!fs.existsSync(refPath) || !fs.existsSync(inPath)) continue;
  const cand = fs.readFileSync(file, 'utf8'); if (!cand.includes('expressive-code')) continue;
  const statics = new Map(); for (const b of blocks(fs.readFileSync(inPath, 'utf8'))) statics.set(b, (statics.get(b) || 0) + 1);
  const strip = (list) => { const s = new Map(statics); return list.filter((b) => { const n = s.get(b); if (n) { s.set(b, n - 1); return false; } return true; }); };
  const a = strip(blocks(fs.readFileSync(refPath, 'utf8'))), b = strip(blocks(cand));
  if (a.length !== b.length) { counts.missing += Math.abs(a.length - b.length); }
  for (let k = 0; k < Math.min(a.length, b.length); k++) {
    counts.blocks++;
    let category;
    if (a[k] === b[k]) category = 'identical';
    else {
      const x = analyze(a[k]), y = analyze(b[k]);
      category = x.structure !== y.structure ? 'markup' : x.styles !== y.styles ? 'colors' : 'equivalent';
      let first;
      if (category === 'colors') { const i = x.chars.findIndex((c, j) => c[1] !== y.chars[j][1]); const t = x.chars.map((c) => c[0]).join(''); first = { context: t.slice(Math.max(0, i - 40), i) + '⟦' + t[i] + '⟧' + t.slice(i + 1, i + 30), ref: x.chars[i][1], cand: y.chars[i][1] }; }
      if ((category === 'markup' || category === 'colors') && examples[category].length < 3000) examples[category].push({ page: rel, index: k, first, reference: a[k], candidate: b[k], refStructure: x.structure, candStructure: y.structure });
    }
    counts[category]++;
    const key = a[k];
    if (!unique.has(key)) unique.set(key, category);
  }
}
const uniqueCounts = {}; for (const c of unique.values()) uniqueCounts[c] = (uniqueCounts[c] || 0) + 1;
console.log('all blocks', counts); console.log('unique reference blocks', unique.size, uniqueCounts);
fs.writeFileSync(reportFile, JSON.stringify({ counts, uniqueCounts, examples }, null, 1));
