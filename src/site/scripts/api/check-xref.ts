// Checks that src/site/data/api/xref-names.json renders every <ApiReference> of the docs exactly as the Astro
// component does today.
//
//   (cd src/frontend && bunx tsx ../site/scripts/api/check-xref.ts)
//
// Scans every `<ApiReference ... />` tag of src/frontend/src/content/docs/**/*.mdx, resolves it with today's
// resolver (`resolveApiReference` of src/frontend/src/utils/api-reference.ts) and with xref-names.json, and
// compares what ApiReference.astro renders from each: status, and per language the label, href and title.
// A name absent from xref-names.json renders like the component's fallback (a template does the same): the
// last segment of the name, no link, the resolver's "could not resolve" message as title.
// Exits with 1 when a tag differs.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatTitle,
  frontendModule,
  frontendRoot,
  renderApiReference,
  siteRoot,
  type RenderedApiReference,
} from './frontend.ts';

type ApiReference = typeof import('../../../frontend/src/utils/api-reference.ts');
type ApiReferenceCore = typeof import('../../../frontend/src/utils/api-reference-core.ts');

const { resolveApiReference } = await frontendModule<ApiReference>('utils/api-reference.ts');
const { API_REFERENCE_FQN_PATTERN } = await frontendModule<ApiReferenceCore>('utils/api-reference-core.ts');

interface XrefName extends RenderedApiReference {
  package?: string;
  packages?: Record<string, RenderedApiReference>;
  overloads?: (RenderedApiReference & { parameterTypes: string[] })[];
}

const xrefNames: Record<string, XrefName> = JSON.parse(
  readFileSync(path.join(siteRoot, 'data/api/xref-names.json'), 'utf8')
);

/* ---- scan the docs -------------------------------------------------- */

interface Tag {
  file: string;
  line: number;
  source: string;
  name: string;
  packageName?: string;
  parameterTypes?: string[];
}

function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return mdxFiles(full);
    return entry.name.endsWith('.mdx') ? [full] : [];
  });
}

function stringAttribute(source: string, attribute: string): string | undefined {
  const match = new RegExp(`\\s${attribute}=(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\})`).exec(source);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

function arrayAttribute(source: string, attribute: string): string[] | undefined {
  const match = new RegExp(`\\s${attribute}=\\{\\s*\\[([\\s\\S]*?)\\]\\s*\\}`).exec(source);
  if (!match) return undefined;
  return [...match[1].matchAll(/(["'])((?:\\.|(?!\1).)*)\1/g)].map((item) => item[2].replace(/\\(.)/g, '$1'));
}

const docsDir = path.join(frontendRoot, 'src/content/docs');
const tags: Tag[] = [];
const files = mdxFiles(docsDir).sort();
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/<ApiReference\b[\s\S]*?\/>/g)) {
    const source = match[0];
    const name = stringAttribute(source, 'name');
    if (name === undefined) throw new Error(`${file}: <ApiReference> without a name: ${source}`);
    tags.push({
      file: path.relative(frontendRoot, file),
      line: text.slice(0, match.index).split('\n').length,
      source,
      name,
      packageName: stringAttribute(source, 'package'),
      parameterTypes: arrayAttribute(source, 'parameterTypes'),
    });
  }
}

/* ---- resolve with xref-names.json ----------------------------------- */

function fallback(name: string, status: 'missing' | 'ambiguous', message: string): RenderedApiReference {
  const label = name.slice(name.lastIndexOf('.') + 1) || name || 'Unknown API';
  const title = formatTitle(message);
  return { status, csharp: { label, title }, typescript: { label, title } };
}

function missing(name: string, packageName?: string): RenderedApiReference {
  const validFqn = API_REFERENCE_FQN_PATTERN.test(name);
  return fallback(
    name,
    'missing',
    validFqn && packageName
      ? `ApiReference: could not resolve "${name}" in package "${packageName}".`
      : validFqn
        ? `ApiReference: could not resolve "${name}" to a generated C# API member.`
        : `ApiReference: "${name}" is not a canonical fully qualified API member name.`
  );
}

function fromXrefNames(tag: Tag): RenderedApiReference {
  const entry = Object.hasOwn(xrefNames, tag.name) ? xrefNames[tag.name] : undefined;
  if (tag.parameterTypes) {
    const key = JSON.stringify(tag.parameterTypes);
    const overload = !tag.packageName || entry?.package === tag.packageName
      ? entry?.overloads?.find((candidate) => JSON.stringify(candidate.parameterTypes) === key)
      : undefined;
    if (overload) {
      const { parameterTypes: _, ...rendered } = overload;
      return rendered;
    }
    return fallback(
      tag.name,
      'missing',
      `ApiReference: "${tag.name}" with parameter types ${key} does not match a generated overload. Use the complete declared C# parameter types, including the extension receiver, and qualify the package if needed.`
    );
  }
  if (!entry) return missing(tag.name, tag.packageName);
  const { package: entryPackage, packages, overloads: _, ...rendered } = entry;
  if (!tag.packageName) return rendered;
  if (packages) return packages[tag.packageName] ?? missing(tag.name, tag.packageName);
  return entryPackage === tag.packageName ? rendered : missing(tag.name, tag.packageName);
}

/* ---- compare ---------------------------------------------------------- */

const differences: { tag: Tag; today: RenderedApiReference; data: RenderedApiReference }[] = [];
const byStatus: Record<string, number> = {};
const distinct = new Set<string>();
let withTypeScriptLink = 0;
let withOverload = 0;
let withPackage = 0;
let absentFromData = 0;

for (const tag of tags) {
  const today = renderApiReference(
    await resolveApiReference(tag.name, tag.packageName, undefined, tag.parameterTypes)
  );
  const data = fromXrefNames(tag);
  if (JSON.stringify(today) !== JSON.stringify(data)) differences.push({ tag, today, data });

  distinct.add(JSON.stringify([tag.name, tag.packageName, tag.parameterTypes]));
  byStatus[today.status] = (byStatus[today.status] ?? 0) + 1;
  if (today.typescript.path) withTypeScriptLink++;
  if (tag.parameterTypes) withOverload++;
  if (tag.packageName) withPackage++;
  if (!Object.hasOwn(xrefNames, tag.name)) absentFromData++;
}

for (const { tag, today, data } of differences) {
  console.log(`DIFF ${tag.file}:${tag.line}  ${tag.source.replace(/\s+/g, ' ')}`);
  console.log(`  today: ${JSON.stringify(today)}`);
  console.log(`  data:  ${JSON.stringify(data)}`);
}

console.log(`${tags.length} <ApiReference> tags in ${new Set(tags.map((tag) => tag.file)).size} of ${files.length} .mdx files, ${distinct.size} distinct references`);
console.log(`  status: ${Object.entries(byStatus).map(([status, count]) => `${status} ${count}`).join(', ')}`);
console.log(`  with a TypeScript link: ${withTypeScriptLink}, with parameterTypes: ${withOverload}, with package: ${withPackage}, names absent from xref-names.json: ${absentFromData}`);
console.log(`  differences: ${differences.length}`);
process.exitCode = differences.length ? 1 : 0;
