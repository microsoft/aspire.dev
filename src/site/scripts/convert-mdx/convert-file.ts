// Converts one MDX article to Markdown with Liquid shortcodes (docs/douze-migration-plan.md, section 7.1).
//
// The source is rewritten by position: only the JSX, ESM and expression ranges are replaced; prose, fences, tables
// and directives are kept as they are. Each JSX element is emitted recursively: its open tag becomes a shortcode, its
// children are emitted from their own source ranges, dedented by their column (MDX allows any indentation inside JSX,
// CommonMark makes four spaces an indented code block), then the closing tag.

import { remarkDirective, remarkGfm, remarkMdx, remarkParse, unified, YAML } from './deps.ts';
import { ASIDE_TYPES, CUSTOM, OS_TABS_SLOTS, SPECS, type Spec } from './components.ts';
import { type Binding, containsDataRef, DataRef, evaluate, evaluateExpression, liquidString, snakeCase, toPlain, type Value } from './values.ts';

export type ProblemKind =
  | 'parse-error'
  | 'unknown-component'
  | 'expression-attribute'
  | 'expression-child'
  | 'export'
  | 'import-unsupported'
  | 'markdown-in-html'
  | 'unexpected-children'
  | 'unslotted-content'
  | 'block-in-paragraph'
  | 'string-quotes'
  | 'props-conflict'
  | 'content-outside-tab';

export interface Problem {
  kind: ProblemKind;
  line: number;
  message: string;
}

export interface ConvertResult {
  output: string;
  changed: boolean;
  problems: Problem[];
  /** Converted constructs by name: components (`Tabs`), `Aside:directive`, `Aside:shortcode`, `import`, `comment`, ... */
  counts: Record<string, number>;
}

export interface ConvertOptions {
  /** `mdx` parses JSX and ESM; `md` (CLI partials, glossary terms, already converted files) only edits the front matter and escapes Liquid syntax. */
  mode: 'mdx' | 'md';
  /**
   * Site data modules (`@data/x` TypeScript imports) by import source, loaded by the caller: their exports are
   * constants for attribute evaluation (`title={licenseTitles.redis}`).
   */
  modules?: Record<string, Record<string, unknown>>;
}

/** The `@data/...` TypeScript modules a source imports (to load before converting it). */
export function dataModuleImports(source: string): string[] {
  return [...source.matchAll(/^import\s[^'"]*from\s+['"](@data\/[^'"]+)['"]/gm)].map((m) => m[1]).filter((s) => !s.endsWith('.json'));
}

const BLOCK_COMPONENTS_IN_PARAGRAPH = new Set(['Aside', 'LearnMore', 'Steps', 'Tabs', 'Pivot', 'CardGrid', 'FileTree', 'Expand', 'OsAwareTabs']);
const MARKDOWN_BLOCKS = new Set(['paragraph', 'heading', 'list', 'code', 'blockquote', 'table', 'thematicBreak', 'containerDirective', 'leafDirective', 'definition']);
const MARKDOWN_PHRASING = new Set(['emphasis', 'strong', 'inlineCode', 'link', 'linkReference', 'delete', 'image', 'imageReference']);
// CommonMark's HTML block start condition 6 (and 1: pre, script, style, textarea)
const HTML_BLOCK_TAGS = new Set('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul pre script style textarea'.split(' '));
const SLOT_WRAPPERS = new Set(['div', 'Fragment', 'span']);
const LIQUID_SYNTAX = /\{\{|\{%/;

const mdxProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkMdx);
const mdProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);

// The front matter is split off with this pattern rather than remark-frontmatter (not installed in src/frontend):
// the body is parsed alone and its offsets are shifted by the header's line count in problem reports.
const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

interface Emitted {
  /** null removes the node (ESM, comments). */
  text: string | null;
  /** Markdown whose continuation lines must be indented like the node when it sits in a list item or a blockquote. */
  structural?: boolean;
}

const start = (n: any): number => n.position.start.offset;
const end = (n: any): number => n.position.end.offset;
const isJsx = (n: any) => n?.type === 'mdxJsxFlowElement' || n?.type === 'mdxJsxTextElement';
const countNewlines = (s: string) => {
  let n = 0;
  for (const c of s) if (c === '\n') n++;
  return n;
};

export function convertSource(original: string, options: ConvertOptions): ConvertResult {
  // A byte order mark hides the front matter and shifts every offset micromark reports (it skips the mark): drop it.
  const source = original.startsWith('\uFEFF') ? original.slice(1) : original;
  const fm = FRONT_MATTER.exec(source);
  const header = fm ? fm[0] : '';
  const frontMatter = fm ? fm[1] : null;
  const body = source.slice(header.length);
  const c = new FileConverter(body, countNewlines(header), options);
  let newBody = c.run();

  let newHeader = header;
  if (frontMatter !== null) {
    const fmText = c.transformFrontMatter(frontMatter);
    if (fmText !== frontMatter || options.mode === 'mdx') newHeader = `---\n${fmText}\n---\n`;
  } else if (Object.keys(c.props).length > 0) {
    newHeader = `---\n${c.transformFrontMatter('')}\n---\n`;
  }
  if (options.mode === 'mdx') {
    newBody = newBody.replace(/^\s*\n/, '');
    if (!newBody.endsWith('\n')) newBody += '\n';
    if (newHeader) newBody = '\n' + newBody;
  }
  const output = newHeader + newBody;
  if (source !== original) c.counts['bom-removed'] = 1;
  return { output, changed: output !== original, problems: c.problems, counts: c.counts };
}

class FileConverter {
  problems: Problem[] = [];
  counts: Record<string, number> = {};
  props: Record<string, unknown> = {};
  private bindings = new Map<string, Binding>();
  private unknownUsed = new Set<string>();
  private lineStarts: number[] = [];
  private indentedRoots = new Set<any>();
  private htmlDepth = 0;

  constructor(
    private src: string,
    private lineOffset: number,
    private options: ConvertOptions,
  ) {}

  run(): string {
    let tree: any;
    try {
      tree = this.parse();
    } catch (e: any) {
      this.problem('parse-error', 0, String(e?.message ?? e).split('\n')[0]);
      return this.src;
    }
    if (this.options.mode === 'mdx') {
      const reordered = this.reorderTypeScriptFirst(tree);
      if (reordered !== this.src) {
        this.src = reordered;
        tree = this.parse();
      }
      this.collectBindings(tree);
      this.collectUnknown(tree);
      // MDX has no indented code: a root block indented by four spaces or more is a paragraph there, code in CommonMark
      for (const ch of tree.children) {
        if (!this.isSpecial(ch) && ch.position.start.column > 4 && /^[ \t]*$/.test(this.src.slice(this.lineStart(start(ch)), start(ch)))) this.indentedRoots.add(ch);
      }
    }
    if (this.options.mode === 'md') return this.emitSlice(0, this.src.length, this.gatherSpecials(tree), 0);
    return this.emitFlowSequence(tree.children, true);
  }

  private parse(): any {
    this.lineStarts = [0];
    for (let i = 0; i < this.src.length; i++) if (this.src[i] === '\n') this.lineStarts.push(i + 1);
    return (this.options.mode === 'mdx' ? mdxProcessor : mdProcessor).parse(this.src);
  }

  // ---------------------------------------------------------------- bookkeeping

  private line(offset: number): number {
    let lo = 0,
      hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1 + this.lineOffset;
  }

  private problem(kind: ProblemKind, at: any, message: string) {
    const offset = typeof at === 'number' ? at : at?.position ? start(at) : 0;
    this.problems.push({ kind, line: this.line(offset), message });
  }

  private count(key: string) {
    this.counts[key] = (this.counts[key] ?? 0) + 1;
  }

  // ---------------------------------------------------------------- TypeScript first AppHost tabs

  /**
   * Moves the TypeScript tab before the first tab of every `aspire-lang` tab set, as the site's remark plugin
   * (src/frontend/config/remark-typescript-first-apphost-tabs.mjs) does at render time, with the same source edits.
   */
  private reorderTypeScriptFirst(tree: any): string {
    const edits: { insertAt: number; moveStart: number; moveEnd: number }[] = [];
    const str = (n: any, name: string) => {
      const a = n.attributes?.find((x: any) => x.type === 'mdxJsxAttribute' && x.name === name);
      return typeof a?.value === 'string' ? a.value : undefined;
    };
    const isTab = (n: any) => n?.type === 'mdxJsxFlowElement' && n.name === 'TabItem';
    const isTs = (n: any) => {
      if (!isTab(n)) return false;
      const id = str(n, 'id')?.toLowerCase();
      const label = str(n, 'label')?.toLowerCase();
      return id === 'typescript' || label === 'typescript' || label === 'typescript apphost';
    };
    const visit = (n: any) => {
      if (n.type === 'mdxJsxFlowElement' && n.name === 'Tabs' && str(n, 'syncKey') === 'aspire-lang') {
        const tabs = n.children.filter(isTab);
        const ts = tabs.findIndex(isTs);
        if (ts > 0) {
          const moveEnd = tabs[ts + 1] ? start(tabs[ts + 1]) : this.src.lastIndexOf('</Tabs>', end(n));
          edits.push({ insertAt: start(tabs[0]), moveStart: start(tabs[ts]), moveEnd });
        }
      }
      for (const ch of n.children ?? []) visit(ch);
    };
    visit(tree);
    let s = this.src;
    for (const { insertAt, moveStart, moveEnd } of edits.sort((a, b) => b.moveStart - a.moveStart)) {
      s = s.slice(0, insertAt) + s.slice(moveStart, moveEnd) + s.slice(insertAt, moveStart) + s.slice(moveEnd);
      this.count('reorder:typescript-first');
    }
    return s;
  }

  // ---------------------------------------------------------------- imports

  private collectBindings(tree: any) {
    for (const node of tree.children) {
      if (node.type !== 'mdxjsEsm') continue;
      for (const stmt of node.data?.estree?.body ?? []) {
        if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'VariableDeclaration' && stmt.declaration.kind === 'const') {
          // `export const x = [...]` used as an attribute value: a constant when it is a literal
          for (const d of stmt.declaration.declarations) {
            try {
              if (d.id.type !== 'Identifier' || !d.init) throw new Error('destructuring');
              const v = toPlain(evaluate(d.init, this.bindings));
              this.bindings.set(d.id.name, { kind: 'value', value: 'export', local: d.id.name, source: 'export', constant: v });
              this.count('export-const');
            } catch (e: any) {
              this.problem('export', node, `export const ${d.id?.name ?? ''} is not a literal: ${e.message}`);
            }
          }
          continue;
        }
        if (stmt.type !== 'ImportDeclaration') {
          this.problem('export', node, `${stmt.type} is not converted`);
          continue;
        }
        const source: string = stmt.source.value;
        for (const s of stmt.specifiers) {
          const local = s.local.name;
          const imported = s.type === 'ImportSpecifier' ? (s.imported.name ?? s.imported.value) : null;
          const mod = this.options.modules?.[source];
          if (mod && s.type !== 'ImportNamespaceSpecifier') {
            const key = imported ?? 'default';
            this.bindings.set(local, { kind: 'value', value: source, local, source, constant: mod[key] });
          } else this.bindings.set(local, this.classifyImport(source, local, imported));
        }
        if (source.includes('?raw')) this.problem('import-unsupported', node, `raw import '${source}'`);
      }
    }
  }

  private classifyImport(source: string, local: string, imported: string | null): Binding {
    const clean = source.replace(/\?.*$/, '');
    if (source.includes('?raw')) return { kind: 'raw', value: source, local, source };
    const asset = /^(?:@assets\/|(?:\.\.\/)+assets\/)(.+)$/.exec(clean);
    if (asset && /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(clean)) return { kind: 'image', value: `/assets/images/${asset[1]}`, local, source };
    if (clean.endsWith('.json')) {
      const key = clean.split('/').pop()!.replace(/\.json$/, '');
      return { kind: 'data', value: imported ? `${key}.${imported}` : key, local, source };
    }
    if (clean.endsWith('.astro')) return { kind: 'component', value: imported ?? clean.split('/').pop()!.replace(/\.astro$/, ''), local, source };
    if (/^(@astrojs\/starlight\/components|starlight-kbd\/components|astro:assets|starlight-plugin-icons\/components)/.test(clean))
      return { kind: 'component', value: imported ?? local, local, source };
    return { kind: 'module', value: source, local, source };
  }

  private componentName(el: any): string {
    const b = this.bindings.get(el.name);
    return b?.kind === 'component' ? b.value : el.name;
  }

  private isHtml(el: any) {
    return el.name !== null && /^[a-z]/.test(el.name);
  }

  private collectUnknown(tree: any) {
    const visit = (n: any) => {
      if (isJsx(n) && n.name && !this.isHtml(n)) {
        const name = this.componentName(n);
        if (!SPECS[name] && !CUSTOM.has(name)) {
          this.unknownUsed.add(n.name.split('.')[0]);
          return;
        }
      }
      for (const ch of n.children ?? []) visit(ch);
    };
    visit(tree);
  }

  // ---------------------------------------------------------------- emission of sequences and slices

  /** Specials are the nodes the converter replaces; everything else is copied from the source. */
  private isSpecial(n: any): boolean {
    if (this.indentedRoots.has(n)) return true;
    switch (n.type) {
      case 'mdxjsEsm':
      case 'mdxFlowExpression':
      case 'mdxTextExpression':
      case 'mdxJsxFlowElement':
      case 'mdxJsxTextElement':
        return true;
      case 'inlineCode':
        return LIQUID_SYNTAX.test(this.src.slice(start(n), end(n))) && !this.isRawWrapped(n);
      case 'text':
        return this.options.mode === 'mdx' && LIQUID_SYNTAX.test(this.src.slice(start(n), end(n)));
      case 'code':
        return this.options.mode === 'mdx' && LIQUID_SYNTAX.test(n.value ?? '');
      default:
        return false;
    }
  }

  private isRawWrapped(n: any) {
    return /\{%-?\s*raw\s*-?%\}$/.test(this.src.slice(Math.max(0, start(n) - 20), start(n))) && /^\{%-?\s*endraw\s*-?%\}/.test(this.src.slice(end(n), end(n) + 20));
  }

  private gatherSpecials(node: any, out: any[] = []): any[] {
    for (const ch of node.children ?? []) {
      ch.parentNode = node;
      if (this.isSpecial(ch)) {
        out.push(ch);
        continue;
      }
      if (ch.type === 'paragraph') this.markFlowish(ch);
      this.gatherSpecials(ch, out);
    }
    return out;
  }

  /** A paragraph holding only a block component (`<Aside>text</Aside>` on one line) is treated as that block. */
  private markFlowish(p: any) {
    if (this.htmlDepth === 0 && !p.htmlChecked && this.startsHtmlBlock(p)) {
      p.htmlChecked = true;
      this.checkMarkdownInHtml({ ...p, name: p.children[0].name });
    }
    const meaningful = p.children.filter((x: any) => !(x.type === 'text' && !x.value.trim()));
    if (meaningful.length === 1 && meaningful[0].type === 'mdxJsxTextElement') meaningful[0].flowish = true;
  }

  /**
   * Emits flow children one after the other, each dedented by its own column; the whitespace between children is
   * reduced to its newlines (at most one blank line). Removed children (imports, comments) leave a blank line.
   */
  private emitFlowSequence(children: any[], root = false, slotParent: string | null = null): string {
    let out = '';
    let prev: any = null;
    let prevEnd: number | null = null;
    let sep = 0;
    let gapText = '';
    let removed = false;
    for (const ch of children) {
      if (ch.type === 'text' && !ch.value.trim()) continue;
      ch.parentNode ??= null;
      const s = start(ch);
      if (prevEnd !== null) {
        const gap = this.src.slice(prevEnd, s);
        sep = Math.max(sep, countNewlines(gap));
        gapText = removed ? '\n\n' : gap;
      }
      prevEnd = end(ch);
      const text = this.emitChild(ch, slotParent);
      if (text === null) {
        removed = true;
        continue;
      }
      if (out !== '') {
        let joint: string;
        if (removed) joint = '\n\n';
        else if (sep === 0) joint = /^\s*$/.test(gapText) ? gapText : ' ';
        else if (root && /^\s*$/.test(gapText)) joint = gapText.replace(/[ \t]+$/, '');
        else joint = '\n'.repeat(Math.min(sep, 2));
        if (countNewlines(joint) === 1 && this.needsBlankLine(prev, ch)) {
          joint = '\n\n';
          this.count('blank-line-added');
        }
        out += joint;
      }
      out += text;
      prev = ch;
      sep = 0;
      removed = false;
    }
    if (root && prevEnd !== null) out += this.src.slice(prevEnd);
    return out;
  }

  /**
   * MDX ends a JSX block at its closing tag; CommonMark continues an HTML block (and a paragraph) until a blank line.
   * Two flow siblings of which one is JSX, other than two paired shortcodes (whose output Douze delimits), get a
   * blank line between them.
   */
  private needsBlankLine(a: any, b: any): boolean {
    const jsx = (n: any) => n?.type === 'mdxJsxFlowElement';
    if (!jsx(a) && !jsx(b)) return false;
    return !(this.isPairedShortcode(a) && this.isPairedShortcode(b));
  }

  private isPairedShortcode(n: any): boolean {
    if (n?.type !== 'mdxJsxFlowElement' || n.name === null || this.isHtml(n)) return false;
    const name = this.componentName(n);
    return name === 'Aside' || name === 'OsAwareTabs' || SPECS[name]?.block === true;
  }

  private emitChild(ch: any, slotParent: string | null): string | null {
    if (slotParent && isJsx(ch) && this.attr(ch, 'slot') !== undefined) return this.emitSlot(ch);
    if (ch.type === 'paragraph') this.markFlowish(ch);
    if (this.isSpecial(ch) && ch.type !== 'code' && !this.indentedRoots.has(ch)) return this.emitSpecial(ch).text;
    const ls = this.lineStart(start(ch));
    const prefix = this.src.slice(ls, start(ch));
    const dedent = /^[ \t]*$/.test(prefix) ? prefix.length : 0;
    return this.emitSlice(start(ch), end(ch), this.gatherSpecials(ch), dedent);
  }

  private lineStart(offset: number) {
    return this.src.lastIndexOf('\n', offset - 1) + 1;
  }

  /** Copies [from, to) with the given specials replaced; the copied lines lose up to `dedent` leading spaces. */
  private emitSlice(from: number, to: number, specials: any[], dedent: number): string {
    let out = '';
    let pos = from;
    for (const sp of specials) {
      let s = start(sp);
      let e = end(sp);
      if (sp.type === 'code' && !this.indentedRoots.has(sp)) {
        // Douze protects fences indented by at most three spaces from Liquid; others are wrapped in raw
        const prefix = this.dedentSegment(this.lineStart(s), s, dedent, true);
        out += this.dedentSegment(pos, s, dedent, pos !== from);
        const fenceText = this.dedentSegment(s, e, dedent, false);
        if (/^ {0,3}$/.test(prefix)) out += fenceText;
        else {
          this.count('liquid-raw-fence');
          const lines = fenceText.split('\n');
          lines[0] = '{% raw %}' + lines[0];
          const last = lines.length - 1;
          const m = /^(\s*)(.*)$/.exec(lines[last])!;
          lines[last] = m[1] + '{% endraw %}' + m[2];
          out += lines.join('\n');
        }
        pos = e;
        continue;
      }
      const emitted = this.indentedRoots.has(sp) ? this.emitIndentedRoot(sp) : this.emitSpecial(sp);
      if (emitted.text === null) {
        const ls = this.lineStart(s);
        if (ls >= pos && /^[ \t]*$/.test(this.src.slice(ls, s)) && (this.src[e] === '\n' || e === this.src.length)) {
          s = ls;
          if (this.src[e] === '\n') e++;
        }
      }
      out += this.dedentSegment(pos, s, dedent, pos !== from);
      if (emitted.text) out += emitted.structural ? this.reindent(sp, emitted.text, dedent) : emitted.text;
      pos = Math.max(pos, e);
    }
    out += this.dedentSegment(pos, to, dedent, pos !== from);
    return out;
  }

  private dedentSegment(from: number, to: number, dedent: number, mayStartLine: boolean): string {
    const seg = this.src.slice(from, to);
    if (dedent === 0 || seg === '') return seg;
    const strip = (line: string) => {
      let i = 0;
      while (i < dedent && i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
      return line.slice(i);
    };
    const lines = seg.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0 || (mayStartLine && this.src[from - 1] === '\n')) lines[i] = strip(lines[i]);
    }
    return lines.join('\n');
  }

  /** Indents the continuation lines of Markdown emitted for a node nested in a list item or a blockquote. */
  private reindent(node: any, text: string, dedent: number): string {
    let prefix = this.src.slice(this.lineStart(start(node)), start(node));
    let i = 0;
    while (i < dedent && (prefix[i] === ' ' || prefix[i] === '\t')) i++;
    prefix = prefix.slice(i).replace(/[^\s>]/g, ' ');
    if (prefix === '') return text;
    return text
      .split('\n')
      .map((l, idx) => (idx === 0 ? l : l === '' ? prefix.trimEnd() : prefix + l))
      .join('\n');
  }

  // ---------------------------------------------------------------- specials

  /**
   * JSX left for the manual queue, wrapped in raw: its `{{`/`{%` (object literals, expressions) must not be read as
   * Liquid, so the page still builds and shows the JSX as text until it is converted by hand.
   */
  private keepRaw(n: any): string {
    this.count('kept-raw');
    return `{% raw %}${this.src.slice(start(n), end(n))}{% endraw %}`;
  }

  private emitIndentedRoot(n: any): Emitted {
    this.count('dedent:root');
    return { text: this.emitSlice(start(n), end(n), this.gatherSpecials(n), n.position.start.column - 1) };
  }

  private emitSpecial(n: any): Emitted {
    switch (n.type) {
      case 'mdxjsEsm': {
        const kept = (n.data?.estree?.body ?? []).filter((stmt: any) => (stmt.specifiers ?? []).some((s: any) => this.unknownUsed.has(s.local.name)));
        if (kept.length) return { text: kept.map((stmt: any) => this.src.slice(stmt.start, stmt.end)).join('\n') };
        this.count('import');
        return { text: null };
      }
      case 'mdxFlowExpression':
      case 'mdxTextExpression': {
        const program = n.data?.estree;
        if (program && program.body.length === 0) {
          this.count('comment');
          return { text: null };
        }
        const expr = program?.body?.[0]?.type === 'ExpressionStatement' ? program.body[0].expression : null;
        if (expr && program.body.length === 1) {
          // {0} in prose is a format placeholder the author meant literally (MDX renders 0): kept as written
          if (expr.type === 'Literal' && typeof expr.value === 'number') {
            this.count('expression:number-literal-kept');
            return { text: this.src.slice(start(n), end(n)) };
          }
          let v: Value;
          try {
            v = evaluateExpression({ data: { estree: program } }, this.bindings, this.src.slice(start(n) + 1, end(n) - 1));
          } catch {
            v = undefined;
          }
          if (typeof v === 'string') {
            const rawParent = n.parentNode && isJsx(n.parentNode) && ['style', 'script'].includes(n.parentNode.name);
            if (rawParent || /^[^<>*_`\[\]\\&{}]*$/.test(v) || /^[{}]$/.test(v)) {
              this.count('expression:string');
              return { text: v };
            }
          }
        }
        this.problem('expression-child', n, `expression {${String(n.value).trim().slice(0, 60)}} kept as is`);
        return { text: this.keepRaw(n) };
      }
      case 'inlineCode':
      case 'text':
        this.count('liquid-raw');
        return { text: `{% raw %}${this.src.slice(start(n), end(n))}{% endraw %}` };
      default:
        return this.emitElement(n);
    }
  }

  private emitElement(el: any): Emitted {
    if (el.name === null) {
      this.count('Fragment');
      return { text: this.emitBody(el).body, structural: true };
    }
    if (this.isHtml(el)) return this.emitHtml(el);
    const name = this.componentName(el);
    if (el.type === 'mdxJsxTextElement' && !el.flowish && BLOCK_COMPONENTS_IN_PARAGRAPH.has(name))
      this.problem('block-in-paragraph', el, `<${el.name}> inside a paragraph`);
    switch (name) {
      case 'Fragment':
        this.count('Fragment');
        return { text: this.emitBody(el).body, structural: true };
      case 'Aside':
        return this.emitAside(el);
      case 'Include':
        return this.emitInclude(el);
      case 'Image':
        return this.emitImage(el);
      case 'ThemeImage':
        return this.emitThemeImage(el);
      case 'Code':
        return this.emitCode(el);
      case 'OsAwareTabs':
        return this.emitOsTabs(el);
    }
    const spec = SPECS[name];
    if (!spec) {
      this.problem('unknown-component', el, `<${el.name}> has no mapping; kept as JSX`);
      return { text: this.keepRaw(el) };
    }
    return this.emitSpec(el, name, spec);
  }

  // ---------------------------------------------------------------- attributes

  private attr(el: any, name: string): any {
    return el.attributes.find((a: any) => a.type === 'mdxJsxAttribute' && a.name === name);
  }

  /** The source of an attribute's `{...}` value, from its position. */
  private attrSource(a: any): string | undefined {
    if (!a.position) return undefined;
    const text = this.src.slice(start(a), end(a));
    const open = text.indexOf('{');
    const close = text.lastIndexOf('}');
    return open >= 0 && close > open ? text.slice(open + 1, close) : undefined;
  }

  /** The attributes of an element, evaluated. Failures are reported and the attribute is skipped. */
  private readAttrs(el: any): { name: string; value: Value; node: any }[] {
    const out: { name: string; value: Value; node: any }[] = [];
    for (const a of el.attributes) {
      if (a.type === 'mdxJsxExpressionAttribute') {
        this.problem('expression-attribute', a.position ? a : el, `spread attribute {${a.value}} on <${el.name}>`);
        continue;
      }
      if (a.value === null || a.value === undefined) out.push({ name: a.name, value: true, node: a });
      else if (typeof a.value === 'string') out.push({ name: a.name, value: a.value, node: a });
      else {
        try {
          out.push({ name: a.name, value: evaluateExpression(a.value, this.bindings, this.attrSource(a)), node: a });
        } catch (e: any) {
          this.problem('expression-attribute', a.position ? a : el, `${a.name}={${String(a.value.value).trim().slice(0, 80)}} on <${el.name}>: ${e.message}`);
        }
      }
    }
    return out;
  }

  private propsKey(base: string): string {
    let key = base;
    for (let i = 2; key in this.props; i++) key = `${base}_${i}`;
    return key;
  }

  /** A Liquid argument value, or undefined to omit the argument. */
  private liquid(v: Value, tag: string, argName: string, at: any): string | undefined {
    if (v === undefined) return undefined;
    if (v === null) return 'nil';
    if (typeof v === 'string') {
      const s = liquidString(v);
      if (!s.ok) this.problem('string-quotes', at, `value of ${argName} has both quote kinds; '"' written as &quot;`);
      return s.text;
    }
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v instanceof DataRef) return v.path;
    if (containsDataRef(v)) {
      this.problem('expression-attribute', at, `${argName} mixes literals and imported data`);
      return undefined;
    }
    const plain = toPlain(v);
    const json = JSON.stringify(plain);
    const base = `${tag}_${argName}`;
    const same = Object.keys(this.props).find((k) => (k === base || k.startsWith(base + '_')) && /^\d*$/.test(k.slice(base.length + 1)) && JSON.stringify(this.props[k]) === json);
    if (same) return `props.${same}`;
    const key = this.propsKey(base);
    this.props[key] = plain;
    this.count('props');
    return `props.${key}`;
  }

  private tag(name: string, args: string[]): string {
    return `{% ${name}${args.length ? ' ' + args.join(', ') : ''} %}`;
  }

  /** Builds the argument list: the spec's positional props first, then the others as named arguments, in source order. */
  private args(el: any, tag: string, spec: { positional?: string[]; rename?: Record<string, string>; drop?: string[] }, extra: [string, Value][] = []): string[] {
    const attrs = this.readAttrs(el).filter((a) => a.name !== 'slot');
    const positional: string[] = [];
    const named: string[] = [];
    for (const p of spec.positional ?? []) {
      const a = attrs.find((x) => x.name === p);
      if (!a) continue;
      const v = this.liquid(a.value, tag, snakeCase(p), a.node);
      if (v !== undefined) positional.push(v);
    }
    for (const a of attrs) {
      if (spec.positional?.includes(a.name) || spec.drop?.includes(a.name)) continue;
      const n = spec.rename?.[a.name] ?? snakeCase(a.name);
      const v = this.liquid(a.value, tag, n, a.node);
      if (v !== undefined) named.push(`${n}: ${v}`);
    }
    for (const [n, value] of extra) {
      const v = this.liquid(value, tag, n, el);
      if (v !== undefined) named.push(`${n}: ${v}`);
    }
    return [...positional, ...named];
  }

  // ---------------------------------------------------------------- element bodies

  private openTagEnd(el: any): number {
    const s = this.src;
    let i = start(el) + 1;
    let quote: string | null = null;
    let depth = 0;
    for (; i < end(el); i++) {
      const ch = s[i];
      if (quote) {
        if (ch === '\\' && depth > 0) i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || (ch === '`' && depth > 0)) quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) return i + 1;
    }
    return end(el);
  }

  private isSelfClosing(el: any): boolean {
    const oe = this.openTagEnd(el);
    return this.src[oe - 2] === '/' && oe === end(el);
  }

  private contentRange(el: any): [number, number] | null {
    if (this.isSelfClosing(el)) return null;
    const oe = this.openTagEnd(el);
    const cs = this.src.lastIndexOf('<', end(el) - 1);
    return [oe, Math.max(oe, cs)];
  }

  private hasContent(el: any) {
    return el.children.some((x: any) => !(x.type === 'text' && !x.value.trim()));
  }

  /** The emitted children of an element; `multiline` when the source had them on their own lines. */
  private emitBody(el: any, slotParent: string | null = null): { body: string; multiline: boolean } {
    const range = this.contentRange(el);
    if (!range || !this.hasContent(el)) return { body: '', multiline: false };
    const [cs, ce] = range;
    const content = this.src.slice(cs, ce);
    if (!content.includes('\n')) return { body: this.emitSlice(cs, ce, this.gatherSpecials(el), 0).trim(), multiline: false };
    if (el.type === 'mdxJsxFlowElement' || el.children.some((x: any) => MARKDOWN_BLOCKS.has(x.type) || x.type === 'mdxJsxFlowElement'))
      return { body: this.emitFlowSequence(el.children, false, slotParent), multiline: true };
    // phrasing over several lines (a text element): drop the leading whitespace of continuation lines
    const text = this.emitSlice(cs, ce, this.gatherSpecials(el), 0);
    return { body: text.replace(/\n[ \t]+/g, '\n').trim(), multiline: true };
  }

  private block(open: string, close: string, body: { body: string; multiline: boolean }): string {
    if (!body.multiline) return `${open}${body.body}${close}`;
    return `${open}\n${body.body}\n${close}`;
  }

  private emitSlot(el: any): string {
    const name = String(this.attr(el, 'slot').value);
    this.count('slot');
    let inner: string;
    const others = el.attributes.filter((a: any) => !(a.type === 'mdxJsxAttribute' && a.name === 'slot'));
    if ((el.name === null || SLOT_WRAPPERS.has(el.name)) && others.length === 0) inner = this.emitBody(el).body;
    else inner = this.emitElement(el).text ?? '';
    return `{% slot ${liquidString(name).text} %}\n${inner}\n{% endslot %}`;
  }

  private emitSpec(el: any, name: string, spec: Spec): Emitted {
    this.count(name);
    const args = this.args(el, spec.tag, spec);
    const open = this.tag(spec.tag, args);
    const hasSlots = el.children.some((x: any) => isJsx(x) && this.attr(x, 'slot') !== undefined);
    if (!spec.block) {
      if (this.hasContent(el)) this.problem('unexpected-children', el, `<${el.name}> has children but {% ${spec.tag} %} is not paired; children dropped`);
      return { text: open };
    }
    if (name === 'Tabs')
      for (const ch of el.children)
        if (!(ch.type === 'text' && !ch.value.trim()) && !(isJsx(ch) && this.componentName(ch) === 'TabItem') && ch.type !== 'mdxFlowExpression')
          this.problem('content-outside-tab', ch, `${isJsx(ch) ? '<' + ch.name + '>' : ch.type} inside <Tabs> but outside a <TabItem>`);
    const body = this.emitBody(el, hasSlots ? spec.tag : null);
    return { text: this.block(open, `{% end${spec.tag} %}`, body) };
  }

  // ---------------------------------------------------------------- custom components

  private emitAside(el: any): Emitted {
    this.count('Aside');
    const attrs = this.readAttrs(el);
    const get = (n: string) => attrs.find((a) => a.name === n)?.value;
    let type = String(get('type') ?? 'note');
    if (!ASIDE_TYPES.has(type)) type = 'note';
    const title = get('title');
    const icon = get('icon');
    const body = this.emitBody(el);
    const text = body.body;
    const titleText = typeof title === 'string' ? title : undefined;
    const directive =
      icon === undefined &&
      !/^\s*:::/m.test(text) &&
      (titleText === undefined || !/[[\]\n]/.test(titleText)) &&
      (el.type === 'mdxJsxFlowElement' || el.flowish) &&
      attrs.every((a) => ['type', 'title'].includes(a.name));
    if (directive) {
      this.count('Aside:directive');
      const open = `:::${type}${titleText !== undefined ? `[${titleText}]` : ''}`;
      return { text: `${open}\n${text}${text ? '\n' : ''}:::`, structural: true };
    }
    this.count('Aside:shortcode');
    const extra: [string, Value][] = [];
    const args = [liquidString(type).text, ...this.args({ ...el, attributes: el.attributes.filter((a: any) => a.name !== 'type') }, 'aside', {}, extra)];
    return { text: this.block(this.tag('aside', args), '{% endaside %}', body) };
  }

  private emitInclude(el: any): Emitted {
    this.count('Include');
    const attrs = this.readAttrs(el);
    const rel = attrs.find((a) => a.name === 'relativePath')?.value;
    if (typeof rel !== 'string') {
      this.problem('expression-attribute', el, '<Include> without a literal relativePath');
      return { text: this.keepRaw(el) };
    }
    const others = attrs.filter((a) => a.name !== 'relativePath');
    const args = [liquidString(rel).text, ...others.map((a) => `${snakeCase(a.name)}: ${this.liquid(a.value, 'include_markdown', snakeCase(a.name), a.node)}`)];
    return { text: this.tag('include_markdown', args) };
  }

  private imageArgs(el: any, tag: string, rename: Record<string, string>, positional: string[]): string[] {
    const attrs = this.readAttrs(el).filter((a) => a.name !== 'slot');
    const out: string[] = [];
    for (const p of positional) {
      const a = attrs.find((x) => x.name === p);
      if (a) {
        const v = this.liquid(a.value, tag, p, a.node);
        if (v !== undefined) out.push(v);
      }
    }
    for (const a of attrs) {
      if (positional.includes(a.name)) continue;
      if (a.name === 'data-zoom-off') {
        if (a.value !== false) out.push('zoomable: false');
        continue;
      }
      const n = rename[a.name] ?? snakeCase(a.name);
      const v = this.liquid(a.value, tag, n, a.node);
      if (v !== undefined) out.push(`${n}: ${v}`);
    }
    return out;
  }

  private emitImage(el: any): Emitted {
    this.count('Image');
    return { text: this.tag('image', this.imageArgs(el, 'image', { 'class:list': 'class', className: 'class' }, ['src'])) };
  }

  private emitThemeImage(el: any): Emitted {
    this.count('ThemeImage');
    return { text: this.tag('image', this.imageArgs(el, 'image', { classOverride: 'class', 'class:list': 'class' }, [])) };
  }

  /** `<Code code="..." lang="x" title="y" mark={...} />` becomes a fenced code block. */
  private emitCode(el: any): Emitted {
    const attrs = this.readAttrs(el).filter((a) => a.name !== 'slot');
    const code = attrs.find((a) => a.name === 'code');
    if (!code || typeof code.value !== 'string') {
      if (!code && !el.attributes.some((a: any) => a.name === 'code')) this.problem('expression-attribute', el, '<Code> without a code attribute');
      return { text: this.keepRaw(el) };
    }
    this.count('Code');
    const content = code.value.replace(/\n$/, '');
    const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((m) => m.length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    const meta: string[] = [];
    const lang = attrs.find((a) => a.name === 'lang')?.value;
    for (const a of attrs) {
      if (a.name === 'code' || a.name === 'lang') continue;
      const v = a.value;
      if (['mark', 'ins', 'del'].includes(a.name)) {
        const items = Array.isArray(v) ? v : [v];
        if (items.every((x) => typeof x === 'number' || (typeof x === 'string' && /^\d+(-\d+)?$/.test(x)))) meta.push(`${a.name === 'mark' ? '' : a.name + '='}{${items.join(',')}}`);
        else for (const x of items) meta.push(`${a.name}=${JSON.stringify(String(x))}`);
      } else if (v === true) meta.push(a.name);
      else if (typeof v === 'string') meta.push(`${a.name}=${JSON.stringify(v)}`);
      else if (typeof v === 'number') meta.push(`${a.name}={${v}}`);
      else if (Array.isArray(v) && v.every((x) => typeof x === 'number' || typeof x === 'string')) meta.push(`${a.name}={${v.join(',')}}`);
      else if (v !== false && v !== undefined) this.problem('expression-attribute', a.node, `<Code ${a.name}> cannot be written as fence meta`);
    }
    const info = [typeof lang === 'string' ? lang : '', ...meta].filter(Boolean).join(' ');
    return { text: `${fence}${info}\n${content}\n${fence}`, structural: true };
  }

  private emitOsTabs(el: any): Emitted {
    this.count('OsAwareTabs');
    const sync = this.readAttrs(el).filter((a) => a.name === 'syncKey');
    const args = sync.length ? [`sync: ${this.liquid(sync[0].value, 'os_tabs', 'sync', sync[0].node)}`] : [];
    const bySlot = new Map<string, string[]>();
    for (const ch of el.children) {
      if (ch.type === 'text' && !ch.value.trim()) continue;
      const slot = isJsx(ch) ? this.attr(ch, 'slot')?.value : undefined;
      if (typeof slot !== 'string' || !OS_TABS_SLOTS.some((s) => s.slot === slot)) {
        this.problem('unslotted-content', ch, `content of <${el.name}> outside the unix and windows slots is dropped (the component renders only the two slots)`);
        continue;
      }
      const others = ch.attributes.filter((a: any) => !(a.type === 'mdxJsxAttribute' && a.name === 'slot'));
      const inner = (ch.name === null || SLOT_WRAPPERS.has(ch.name)) && others.length === 0 ? this.emitBody(ch).body : (this.emitElement(ch).text ?? '');
      bySlot.set(slot, [...(bySlot.get(slot) ?? []), inner]);
    }
    const parts = [this.tag('os_tabs', args)];
    for (const { slot, label, icon } of OS_TABS_SLOTS) {
      parts.push(this.tag('tab', [liquidString(label).text, `icon: ${liquidString(icon).text}`]));
      parts.push((bySlot.get(slot) ?? []).join('\n\n'));
      parts.push('{% endtab %}');
    }
    parts.push('{% endos_tabs %}');
    return { text: parts.join('\n') };
  }

  // ---------------------------------------------------------------- HTML elements

  /**
   * Lowercase elements are HTML. They are kept as written unless an attribute needs converting (`className`, an
   * expression), a descendant is converted, or Markdown blocks inside need the blank lines CommonMark requires to
   * leave an HTML block (MDX parses Markdown inside JSX without them).
   */
  private emitHtml(el: any): Emitted {
    if (el.type === 'mdxJsxFlowElement' && this.htmlDepth === 0) this.checkMarkdownInHtml(el);
    const specials = this.gatherSpecials(el);
    const openText = this.htmlOpenTag(el);
    const range = this.contentRange(el);
    const flow = el.type === 'mdxJsxFlowElement';
    const hasMdBlock = flow && el.children.some((x: any) => MARKDOWN_BLOCKS.has(x.type));
    if (openText === null && specials.length === 0 && !hasMdBlock) return { text: this.src.slice(start(el), end(el)) };
    this.htmlDepth++;
    try {
      return this.emitHtmlRebuilt(el, openText, range, flow, hasMdBlock, specials);
    } finally {
      this.htmlDepth--;
    }
  }

  private emitHtmlRebuilt(el: any, openText: string | null, range: [number, number] | null, flow: boolean, hasMdBlock: boolean, specials: any[]): Emitted {
    const open = openText ?? this.src.slice(start(el), this.openTagEnd(el));
    if (!range) return { text: open };
    const close = this.src.slice(range[1], end(el));
    const content = this.src.slice(range[0], range[1]);
    if (!content.includes('\n') || !flow) return { text: open + this.emitSlice(range[0], range[1], specials, 0) + close };
    const body = this.emitFlowSequence(el.children);
    return { text: hasMdBlock ? `${open}\n\n${body}\n\n${close}` : `${open}\n${body}\n${close}` };
  }

  /** The open tag rebuilt when an attribute needs converting, else null. */
  private htmlOpenTag(el: any): string | null {
    const needs = el.attributes.some((a: any) => a.type === 'mdxJsxExpressionAttribute' || a.name === 'className' || (a.value !== null && typeof a.value === 'object'));
    if (!needs) return null;
    const parts: string[] = [];
    for (const a of el.attributes) {
      if (a.type === 'mdxJsxExpressionAttribute') {
        this.problem('expression-attribute', el, `spread attribute on <${el.name}> kept as is`);
        parts.push(`{${a.value}}`);
        continue;
      }
      const name = a.name === 'className' ? 'class' : a.name;
      if (a.value === null) {
        parts.push(name);
        continue;
      }
      let v: Value = a.value;
      if (typeof a.value === 'object') {
        try {
          v = evaluateExpression(a.value, this.bindings, this.attrSource(a));
        } catch (e: any) {
          this.problem('expression-attribute', a.position ? a : el, `${a.name}={${a.value.value}} on <${el.name}>: ${e.message}`);
          parts.push(`${a.name}={${a.value.value}}`);
          continue;
        }
      }
      if (name === 'style' && v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof DataRef))
        v = Object.entries(v)
          .map(([k, x]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${typeof x === 'number' && x !== 0 ? `${x}px` : x}`)
          .join('; ');
      if (v === true) parts.push(name);
      else if (v === false || v === undefined || v === null) continue;
      else if (typeof v === 'string' || typeof v === 'number') parts.push(`${name}="${String(v).replace(/"/g, '&quot;')}"`);
      else {
        this.problem('expression-attribute', el, `${a.name} on <${el.name}> is not a string`);
        parts.push(`${a.name}={${a.value.value}}`);
      }
    }
    const self = this.isSelfClosing(el);
    return `<${el.name}${parts.length ? ' ' + parts.join(' ') : ''}${self ? ' />' : '>'}`;
  }

  /**
   * Reports Markdown phrasing written inside a block of HTML (`<li>**x**</li>`, or a paragraph that starts with a
   * block level tag such as `<p>`): MDX renders it, CommonMark keeps it literal inside the HTML block.
   */
  private checkMarkdownInHtml(el: any) {
    let found: any = null;
    const visit = (n: any, inHtml: boolean) => {
      if (found) return;
      for (const ch of n.children ?? []) {
        if (inHtml && MARKDOWN_PHRASING.has(ch.type)) {
          found = ch;
          return;
        }
        if (isJsx(ch)) visit(ch, ch.name !== null && /^[a-z]/.test(ch.name));
        else if (ch.type === 'paragraph' || ch.type === 'heading') {
          ch.htmlChecked = true;
          visit(ch, this.startsHtmlBlock(ch));
        }
        else if (ch.type !== 'tableCell') visit(ch, inHtml);
      }
    };
    visit(el, true);
    if (found) this.problem('markdown-in-html', found, `Markdown (${found.type}) inside <${el.name}> is literal text in CommonMark`);
  }

  /** A paragraph whose first line starts with a block level HTML tag is an HTML block in CommonMark. */
  private startsHtmlBlock(p: any): boolean {
    const first = p.children[0];
    return isJsx(first) && start(first) === start(p) && first.name !== null && HTML_BLOCK_TAGS.has(first.name.toLowerCase());
  }

  // ---------------------------------------------------------------- front matter

  transformFrontMatter(fm: string): string {
    const lines = fm === '' ? [] : fm.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^template:\s*['"]?splash['"]?\s*$/.test(l)) {
        out.push('layout: splash');
        this.count('frontmatter:layout');
        continue;
      }
      if (/^lastUpdated:/.test(l)) {
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) i++;
        this.count('frontmatter:lastUpdated');
        continue;
      }
      const asset = l.replace(/((?:\.\.\/)+)assets\//, '/assets/images/');
      if (asset !== l) this.count('frontmatter:asset');
      out.push(asset);
    }
    if (Object.keys(this.props).length > 0) {
      if (lines.some((l) => /^props:/.test(l))) this.problem('props-conflict', 0, 'front matter already has props; converted values not written');
      else out.push(...YAML.stringify({ props: this.props }, { lineWidth: 0 }).replace(/\n$/, '').split('\n'));
    }
    return out.join('\n');
  }
}
