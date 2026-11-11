// The MDX to Markdown + Liquid shortcodes converter of the aspire.dev articles (docs/douze-migration-plan.md, 7.1).
//
// Usage, from the repository root:
//
//   (cd src/frontend && bunx tsx ../site/scripts/convert-mdx/convert.ts [options])
//
// With no option, converts the whole content:
//   src/frontend/src/content/docs/**/*.mdx  -> src/site/content/**/*.md   (English, ja/ and the locale index pages;
//                                              the English root index, 404, docs and support pages are converted by hand)
//   src/frontend/src/content/docs/reference/cli/includes/*.md -> src/site/content/reference/cli/includes/ (+ includes.yml)
//   src/frontend/src/content/glossary/*.md  -> src/site/content/hub/glossary/
//   src/frontend/src/assets/**              -> src/site/assets/images/** (fonts/ -> src/site/assets/fonts/)
//   the JSON data files the articles import  -> src/site/data/
// and writes report.md and report.json next to this script.
//
// Options:
//   --check          write nothing; list the files whose converted output differs from what is on disk (exit code 1
//                    when any does), so a run on already converted content shows it is up to date
//   --in <dir>       convert the .mdx and .md files of <dir> instead (requires --out); used to check idempotence:
//                    `--in src/site/content --out <tmp>` must reproduce every file unchanged
//   --out <dir>      output folder for --in
//   --only <text>    only the files whose relative path contains <text>
//   --no-assets      skip copying assets and data files
//   --no-report      skip writing report.md and report.json
//   --verbose        print every problem
//
// A converted file is Markdown with no import and no JSX; converting it again (it is a .md file, read in `md` mode,
// which only normalizes the front matter and escapes Liquid syntax in inline code) leaves it unchanged.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './deps.ts';
import { convertSource, type ConvertResult, dataModuleImports, type Problem } from './convert-file.ts';
import { pathToFileURL } from 'node:url';
import { EMITTED_TAGS } from './components.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const check = flag('--check');
const only = option('--only');
const fe = path.join(repoRoot, 'src', 'frontend', 'src');
const site = path.join(repoRoot, 'src', 'site');
const here = path.join(site, 'scripts', 'convert-mdx');

interface Job {
  input: string;
  output: string;
  /** Path shown in the report, relative to the repository. */
  rel: string;
  mode: 'mdx' | 'md';
}

const SKIPPED_ROOT_PAGES = new Set(['index.mdx', '404.mdx', 'docs.mdx', 'support.mdx']);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir).sort()) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const posix = (p: string) => p.split(path.sep).join('/');

function jobs(): Job[] {
  const list: Job[] = [];
  const inDir = option('--in');
  if (inDir) {
    const outDir = option('--out');
    if (!outDir) throw new Error('--in requires --out');
    const root = path.resolve(inDir);
    for (const f of walk(root)) {
      if (!/\.mdx?$/.test(f)) continue;
      const rel = posix(path.relative(root, f));
      list.push({ input: f, output: path.join(path.resolve(outDir), rel.replace(/\.mdx$/, '.md')), rel, mode: f.endsWith('.mdx') ? 'mdx' : 'md' });
    }
  } else {
    const docs = path.join(fe, 'content', 'docs');
    for (const f of walk(docs)) {
      const rel = posix(path.relative(docs, f));
      if (SKIPPED_ROOT_PAGES.has(rel)) continue;
      if (f.endsWith('.mdx')) list.push({ input: f, output: path.join(site, 'content', rel.replace(/\.mdx$/, '.md')), rel: `docs/${rel}`, mode: 'mdx' });
      else if (f.endsWith('.md')) list.push({ input: f, output: path.join(site, 'content', rel), rel: `docs/${rel}`, mode: 'md' });
    }
    const glossary = path.join(fe, 'content', 'glossary');
    for (const f of walk(glossary)) {
      if (!/\.mdx?$/.test(f)) continue;
      const rel = posix(path.relative(glossary, f));
      list.push({ input: f, output: path.join(site, 'content', 'hub', 'glossary', rel.replace(/\.mdx$/, '.md')), rel: `glossary/${rel}`, mode: f.endsWith('.mdx') ? 'mdx' : 'md' });
    }
  }
  return only ? list.filter((j) => j.rel.includes(only)) : list;
}

interface FileReport {
  path: string;
  output: string;
  problems: Problem[];
  counts: Record<string, number>;
}

const reports: FileReport[] = [];
const differing: string[] = [];
const notIdempotent: string[] = [];

// Site data modules imported by the articles (`@data/thanks-license-titles`): their exports are attribute constants.
const modules: Record<string, Record<string, unknown>> = {};
const attempted = new Set<string>();
async function loadModule(source: string) {
  if (attempted.has(source)) return;
  attempted.add(source);
  const base = path.join(fe, 'data', source.slice('@data/'.length));
  const file = ['.ts', '.mts', '.js', '.mjs', ''].map((x) => base + x).find((f) => existsSync(f) && statSync(f).isFile());
  if (!file) return;
  try {
    modules[source] = { ...(await import(pathToFileURL(file).href)) };
  } catch (e: any) {
    console.warn(`cannot load ${source}: ${e.message}`);
  }
}

for (const job of jobs()) {
  const source = readFileSync(job.input, 'utf8');
  for (const m of dataModuleImports(source)) await loadModule(m);
  const result: ConvertResult = convertSource(source, { mode: job.mode, modules });
  const again = convertSource(result.output, { mode: 'md' });
  if (again.output !== result.output) notIdempotent.push(job.rel);
  const outRel = posix(path.relative(repoRoot, job.output));
  reports.push({ path: job.rel, output: outRel, problems: result.problems, counts: result.counts });
  const current = existsSync(job.output) ? readFileSync(job.output, 'utf8') : null;
  if (current !== result.output) {
    differing.push(outRel);
    if (!check) {
      mkdirSync(path.dirname(job.output), { recursive: true });
      writeFileSync(job.output, result.output);
    }
  }
}

function writeIfChanged(file: string, content: string) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === content) return;
  differing.push(posix(path.relative(repoRoot, file)));
  if (!check) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

if (!option('--in')) {
  writeIfChanged(
    path.join(site, 'content', 'reference', 'cli', 'includes', 'includes.yml'),
    '# The CLI option partials are included by {% include_markdown %}; they are not pages.\npermalink: false\n',
  );
  if (!flag('--no-assets') && !check) {
    // Images (and the other assets) keep their tree under assets/images; fonts go to assets/fonts.
    // Files already there (copied by another phase) are kept; a differing one is reported.
    const assets = path.join(fe, 'assets');
    for (const from of walk(assets)) {
      const rel = posix(path.relative(assets, from));
      const to = rel.startsWith('fonts/') ? path.join(site, 'assets', rel) : path.join(site, 'assets', 'images', rel);
      if (existsSync(to)) {
        if (!readFileSync(to).equals(readFileSync(from))) console.warn(`kept existing ${posix(path.relative(repoRoot, to))} (differs from ${rel})`);
        continue;
      }
      mkdirSync(path.dirname(to), { recursive: true });
      cpSync(from, to);
    }
    // The data files the articles import (integrations/gallery, community/contributors, reference/samples, the
    // community section of the release pages).
    for (const f of ['aspire-integrations.json', 'integration-docs.json', 'github-stats.json', 'samples.json', 'github-contributors.json', 'release-contributors.json']) {
      const to = path.join(site, 'data', f);
      if (!existsSync(to)) cpSync(path.join(fe, 'data', f), to);
      else if (!readFileSync(to).equals(readFileSync(path.join(fe, 'data', f)))) console.warn(`kept existing src/site/data/${f} (differs)`);
    }
    // The core team roster of the release pages, a TypeScript module: its list as JSON.
    const { coreTeam } = await import(pathToFileURL(path.join(fe, 'data', 'core-team.ts')).href);
    writeIfChanged(path.join(site, 'data', 'core-team.json'), JSON.stringify(coreTeam, null, 2) + '\n');
  }
}

// ---------------------------------------------------------------- report

const totals: Record<string, number> = {};
const byKind: Record<string, number> = {};
for (const r of reports) {
  for (const [k, v] of Object.entries(r.counts)) totals[k] = (totals[k] ?? 0) + v;
  for (const p of r.problems) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
}
const sortedEntries = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const manual = reports.filter((r) => r.problems.length > 0);
const clean = reports.length - manual.length;
const pct = reports.length ? ((100 * clean) / reports.length).toFixed(1) : '100.0';

if (!flag('--no-report') && !option('--in') && !only && !check) {
  const json = {
    files: reports.length,
    clean,
    cleanPercent: Number(pct),
    notIdempotent,
    converted: Object.fromEntries(sortedEntries(totals)),
    problems: Object.fromEntries(sortedEntries(byKind)),
    shortcodes: EMITTED_TAGS,
    manualQueue: manual.map((r) => ({ path: r.path, output: r.output, problems: r.problems })),
    perFile: reports.map((r) => ({ path: r.path, output: r.output, counts: r.counts, problems: r.problems.length })),
  };
  writeFileSync(path.join(here, 'report.json'), JSON.stringify(json, null, 2) + '\n');

  const md: string[] = [];
  md.push('# MDX conversion report', '');
  md.push('Generated by `convert.ts` (docs/douze-migration-plan.md, section 7.1). Do not edit: rerun the converter.', '');
  md.push(`- Files: ${reports.length} (${reports.filter((r) => r.path.endsWith('.mdx')).length} MDX, ${reports.filter((r) => r.path.endsWith('.md')).length} Markdown)`);
  md.push(`- With no problem: ${clean} (${pct}%)`);
  md.push(`- Manual queue: ${manual.length} files`);
  md.push(`- Not idempotent: ${notIdempotent.length ? notIdempotent.join(', ') : 'none'}`, '');
  md.push('## Converted constructs', '', '| Construct | Count |', '|---|---|');
  for (const [k, v] of sortedEntries(totals)) md.push(`| ${k} | ${v} |`);
  md.push('', '## Problems by kind', '', '| Kind | Count | Files |', '|---|---|---|');
  for (const [k, v] of sortedEntries(byKind)) md.push(`| ${k} | ${v} | ${manual.filter((r) => r.problems.some((p) => p.kind === k)).length} |`);
  md.push('', '## Manual queue', '');
  for (const r of manual) {
    md.push(`### ${r.path}`, '');
    const shown = r.problems.slice(0, 15);
    for (const p of shown) md.push(`- line ${p.line}, \`${p.kind}\`: ${p.message.replace(/\|/g, '\\|')}`);
    if (r.problems.length > shown.length) md.push(`- ... ${r.problems.length - shown.length} more (report.json)`);
    md.push('');
  }
  writeFileSync(path.join(here, 'report.md'), md.join('\n'));
}

console.log(`${reports.length} files, ${clean} without problems (${pct}%), ${manual.length} in the manual queue`);
for (const [k, v] of sortedEntries(byKind)) console.log(`  ${k}: ${v}`);
if (flag('--verbose')) for (const r of manual) for (const p of r.problems) console.log(`${r.path}:${p.line}: ${p.kind}: ${p.message}`);
if (notIdempotent.length) console.log(`not idempotent: ${notIdempotent.join(', ')}`);
if (check) {
  if (differing.length) {
    console.log(`${differing.length} file(s) would change:`);
    for (const d of differing) console.log(`  ${d}`);
    process.exitCode = 1;
  } else console.log('up to date');
} else console.log(`${differing.length} file(s) written`);
