// Precomputes the API reference data the Douze templates render without logic, from the committed API data
// (src/frontend/src/data/pkgs/*.json and src/frontend/src/data/ts-modules/*.json).
//
// Every url, slug and anchor comes from the route utilities of the Astro site (src/frontend/src/utils), loaded
// unmodified through frontend.ts, so the pages keep the urls they have today.
//
//   (cd src/frontend && bunx tsx ../site/scripts/api/build-api-index.ts)
//
// Writes src/site/data/api/ (replaced on every run):
//   routes/indexes.json                 the two landing pages
//   routes/csharp-packages.json         one entry per page: url, md (Markdown twin), file (data file name without
//   routes/csharp-types.json            .json) and the indexes locating the API in that file (`type` into `types`,
//   routes/csharp-members.json          `memberKind`, `members[].index` into the type's `members`; TypeScript:
//   routes/typescript-modules.json      `collection` + `index`, `item` into `handleTypes`, `capability` into the
//   routes/typescript-items.json        handle's `capabilities`), the slugs, member anchors with their aliases,
//   routes/typescript-members.json      and the page headings the sidebar of item and member pages links to
//   legacy-md.json                      TypeScript `.md` aliases kept for previously published base-name urls
//   xref.json                           doc id (T:/M:/P:/F:) -> { url, kind, package, ts? }
//   xref-names.json                     <ApiReference name> -> rendered C# and TypeScript links, per package and overload
//   search-csharp.json                  the search index of /reference/api/csharp/
//   search-typescript.json              the search index of /reference/api/typescript/
//   sidebar/csharp.json, sidebar/typescript.json      sidebars of the landing pages
//   sidebar/csharp/<package>.json, sidebar/typescript/<module>.json   per package / module sidebars
//   counts.json                         page counts per route kind, landing page statistics
//   pkgs/*.json, ts-modules/*.json      copies of the API data, which the pages read (gitignored)

import { cpSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { frontendModule, frontendRoot, renderApiReference, siteRoot, type RenderedApiReference } from './frontend.ts';

type Packages = typeof import('../../../frontend/src/utils/packages.ts');
type ApiSidebar = typeof import('../../../frontend/src/utils/api-sidebar.ts');
type TsModules = typeof import('../../../frontend/src/utils/ts-modules.ts');
type TsApiRoutes = typeof import('../../../frontend/src/utils/ts-api-routes.ts');
type TsApiSidebar = typeof import('../../../frontend/src/utils/ts-api-sidebar.ts');
type TsApiSearch = typeof import('../../../frontend/src/utils/ts-api-search.ts');
type TsApiSearchStats = typeof import('../../../frontend/src/utils/ts-api-search-stats.ts');
type ApiReference = typeof import('../../../frontend/src/utils/api-reference.ts');
type CSharpProvider = typeof import('../../../frontend/src/utils/api-reference/csharp-provider.ts');

const {
  getPackages,
  packageSlug,
  slugify,
  genericArity,
  typeHref,
  memberKindOrder,
  memberKindSlugs,
  resolveMemberAnchors,
  memberNameSlug,
} = await frontendModule<Packages>('utils/packages.ts');
const { getApiReferenceSidebar } = await frontendModule<ApiSidebar>('utils/api-sidebar.ts');
const { getTsModules, tsModuleSlug, tsSlugify } = await frontendModule<TsModules>('utils/ts-modules.ts');
const { getTsItemSlug, getTsMethods, getTsMethodSlug, getTsStandaloneFunctions, getTsTopLevelRouteItems } =
  await frontendModule<TsApiRoutes>('utils/ts-api-routes.ts');
const { getTsApiReferenceSidebar } = await frontendModule<TsApiSidebar>('utils/ts-api-sidebar.ts');
const { buildTsApiSearchIndex } = await frontendModule<TsApiSearch>('utils/ts-api-search.ts');
const { getTsApiSearchStats, formatTsApiSearchStats } =
  await frontendModule<TsApiSearchStats>('utils/ts-api-search-stats.ts');
const { getApiReferenceIndex } = await frontendModule<ApiReference>('utils/api-reference.ts');
const { CSharpLanguageProvider, normalizeTypeName } =
  await frontendModule<CSharpProvider>('utils/api-reference/csharp-provider.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- the API data is untyped JSON, as in the Astro pages */

const outDir = path.join(siteRoot, 'data/api');
const API = '/reference/api';

/** `/reference/api/csharp/aspire.hosting/foo/` -> `/reference/api/csharp/aspire.hosting/foo.md`. */
function markdownPath(url: string): string {
  return `${url.replace(/\/$/, '')}.md`;
}

function fileOf(entry: { filePath?: string; id: string }): string {
  return path.basename(entry.filePath ?? entry.id, '.json');
}

/* ================================================================== */
/*  Data                                                               */
/* ================================================================== */

const packageEntries = await getPackages();
const moduleEntries = await getTsModules();
const apiReferenceIndex = await getApiReferenceIndex();

/* ================================================================== */
/*  C# routes                                                          */
/* ================================================================== */

const csharpPackages: any[] = [];
const csharpTypes: any[] = [];
const csharpMembers: any[] = [];

for (const entry of packageEntries) {
  const pkg = entry.data;
  const file = fileOf(entry);
  const pkgName = pkg.package.name;
  const pkgSlug = packageSlug(pkgName);
  const pkgUrl = `${API}/csharp/${pkgSlug}/`;

  csharpPackages.push({
    url: pkgUrl,
    md: markdownPath(pkgUrl),
    file,
    package: pkgName,
    version: pkg.package.version,
    slug: pkgSlug,
    typeCount: pkg.types.length,
  });

  pkg.types.forEach((type: any, typeIndex: number) => {
    const typeSlug = slugify(type.name, genericArity(type));
    if (!typeSlug) return;

    const typeUrl = typeHref('/', pkgName, type.name, genericArity(type));
    const members: any[] = type.members ?? [];
    const anchors = resolveMemberAnchors(members);
    const memberKinds = memberKindOrder.filter(
      (kind) => memberKindSlugs[kind] && members.some((member) => member.kind === kind)
    );

    csharpTypes.push({
      url: typeUrl,
      md: markdownPath(typeUrl),
      file,
      package: pkgName,
      packageSlug: pkgSlug,
      type: typeIndex,
      typeSlug,
      name: type.name,
      fullName: type.fullName,
      kind: type.kind,
      memberKinds: memberKinds.map((kind) => ({ kind, slug: memberKindSlugs[kind] })),
      anchors: anchors.map(({ exact, aliases }) => (aliases.length ? { exact, aliases } : { exact })),
    });

    for (const memberKind of memberKinds) {
      const memberKindSlug = memberKindSlugs[memberKind];
      const url = `${typeUrl}${memberKindSlug}/`;
      csharpMembers.push({
        url,
        md: markdownPath(url),
        file,
        package: pkgName,
        packageSlug: pkgSlug,
        type: typeIndex,
        typeSlug,
        memberKind,
        memberKindSlug,
        members: members.flatMap((member, index) =>
          member.kind === memberKind
            ? [{ index, anchor: anchors[index].exact, aliases: anchors[index].aliases }]
            : []
        ),
      });
    }
  });
}

/* ================================================================== */
/*  TypeScript routes                                                  */
/* ================================================================== */

type Heading = { depth: 2; slug: string; text: string };

const typescriptModules: any[] = [];
const typescriptItems: any[] = [];
const typescriptMembers: any[] = [];
const moduleHeadingsByName = new Map<string, Heading[]>();

/** Headings of typescript/[module]/[item]/index.astro, which its sidebar links to. */
function itemHeadings(item: any, itemKind: string): Heading[] {
  const headings: Heading[] = [];
  if (itemKind === 'handle') {
    const capabilities = item.capabilities ?? [];
    const getters = capabilities.filter((c: any) => c.kind === 'PropertyGetter');
    const setters = capabilities.filter((c: any) => c.kind === 'PropertySetter');
    const methods = getTsMethods(item, true);
    if (getters.length > 0 || setters.length > 0) headings.push({ depth: 2, slug: 'properties', text: 'Properties' });
    if (methods.length > 0) headings.push({ depth: 2, slug: 'methods', text: 'Methods' });
  } else if (itemKind === 'dto') {
    if ((item.fields ?? []).length > 0) headings.push({ depth: 2, slug: 'fields', text: 'Fields' });
  } else if (itemKind === 'enum') {
    if ((item.members ?? []).length > 0) headings.push({ depth: 2, slug: 'values', text: 'Values' });
  } else if (itemKind === 'function') {
    headings.push({ depth: 2, slug: 'signature', text: 'Signature' });
    if ((item.expandedTargetTypes ?? []).length > 0) headings.push({ depth: 2, slug: 'applies-to', text: 'Applies to' });
  }
  return headings;
}

/** Headings of typescript/[module]/[item]/[member]/index.astro. */
const memberHeadings: Heading[] = [
  { depth: 2, slug: 'signature', text: 'Signature' },
  { depth: 2, slug: 'defined-on', text: 'Defined on' },
];

const itemCollections = [
  { collection: 'handleTypes', itemKind: 'handle' },
  { collection: 'dtoTypes', itemKind: 'dto' },
  { collection: 'enumTypes', itemKind: 'enum' },
] as const;

for (const entry of moduleEntries) {
  const doc: any = entry.data;
  const file = fileOf(entry);
  const moduleName = doc.package.name;
  const moduleSlug = tsModuleSlug(moduleName);
  const moduleUrl = `${API}/typescript/${moduleSlug}/`;
  const topLevelItems = getTsTopLevelRouteItems(doc);
  const standaloneFunctions = getTsStandaloneFunctions(doc);

  // typescript/[module]/index.astro
  const moduleHeadings: Heading[] = [];
  if (doc.handleTypes.length + doc.dtoTypes.length > 0) moduleHeadings.push({ depth: 2, slug: 'types', text: 'Types' });
  if (standaloneFunctions.length > 0) moduleHeadings.push({ depth: 2, slug: 'functions', text: 'Functions' });
  if (doc.enumTypes.length > 0) moduleHeadings.push({ depth: 2, slug: 'enums', text: 'Enums' });
  moduleHeadingsByName.set(moduleName, moduleHeadings);

  typescriptModules.push({
    url: moduleUrl,
    md: markdownPath(moduleUrl),
    file,
    module: moduleName,
    version: doc.package.version,
    slug: moduleSlug,
    counts: {
      functions: doc.functions.length,
      handleTypes: doc.handleTypes.length,
      dtoTypes: doc.dtoTypes.length,
      enumTypes: doc.enumTypes.length,
      total: doc.functions.length + doc.handleTypes.length + doc.dtoTypes.length + doc.enumTypes.length,
    },
    headings: moduleHeadings,
  });

  const addItem = (item: any, itemKind: string, collection: string, index: number) => {
    const slug = getTsItemSlug(item, topLevelItems);
    if (!slug) return undefined;
    const url = `${moduleUrl}${slug}/`;
    const route = {
      url,
      md: markdownPath(url),
      file,
      module: moduleName,
      moduleSlug,
      itemKind,
      collection,
      index,
      slug,
      name: item.name,
      headings: itemHeadings(item, itemKind),
    };
    typescriptItems.push(route);
    return route;
  };

  for (const { collection, itemKind } of itemCollections) {
    doc[collection].forEach((item: any, index: number) => addItem(item, itemKind, collection, index));
  }
  const functionIndexes = new Map<any, number>(doc.functions.map((fn: any, index: number) => [fn, index]));
  for (const fn of standaloneFunctions) {
    addItem(fn, 'function', 'functions', functionIndexes.get(fn)!);
  }

  // typescript/[module]/[item]/[member]/index.astro
  doc.handleTypes.forEach((handle: any, handleIndex: number) => {
    const itemSlug = getTsItemSlug(handle, topLevelItems);
    if (!itemSlug) return;
    const methods = getTsMethods(handle);
    const capabilities: any[] = handle.capabilities ?? [];
    for (const method of methods) {
      const slug = getTsMethodSlug(method, methods, handle.name);
      if (!slug) continue;
      const url = `${moduleUrl}${itemSlug}/${slug}/`;
      typescriptMembers.push({
        url,
        md: markdownPath(url),
        file,
        module: moduleName,
        moduleSlug,
        item: handleIndex,
        itemSlug,
        itemName: handle.name,
        capability: capabilities.indexOf(method),
        slug,
        name: method.name,
        headings: memberHeadings,
      });
    }
  });
}

/* ---- legacy .md aliases ([item].md.ts and [item]/[member].md.ts) ------ */

const legacyMd: any[] = [];
{
  const canonical = new Set(typescriptItems.map((route) => `${route.moduleSlug}/${route.slug}`));
  const legacy = new Map<string, any>();
  for (const route of typescriptItems) {
    const doc: any = moduleEntries.find((entry) => entry.data.package.name === route.module)!.data;
    const item = tsSlugify(doc[route.collection][route.index].name);
    const key = `${route.moduleSlug}/${item}`;
    if (item && !canonical.has(key)) legacy.set(key, { route, item });
  }
  for (const { route, item } of legacy.values()) {
    legacyMd.push({
      md: `${API}/typescript/${route.moduleSlug}/${item}.md`,
      canonical: route.md,
      url: route.url,
      kind: 'item',
      file: route.file,
      collection: route.collection,
      index: route.index,
    });
  }
}
{
  const canonical = new Set(typescriptMembers.map((route) => `${route.moduleSlug}/${route.itemSlug}/${route.slug}`));
  const legacy = new Map<string, any>();
  for (const route of typescriptMembers) {
    const item = tsSlugify(route.itemName);
    const member = tsSlugify(route.name);
    const key = `${route.moduleSlug}/${item}/${member}`;
    if (item && member && !canonical.has(key)) legacy.set(key, { route, item, member });
  }
  for (const { route, item, member } of legacy.values()) {
    legacyMd.push({
      md: `${API}/typescript/${route.moduleSlug}/${item}/${member}.md`,
      canonical: route.md,
      url: route.url,
      kind: 'member',
      file: route.file,
      item: route.item,
      capability: route.capability,
    });
  }
}

/* ================================================================== */
/*  Search indexes (the two landing pages)                             */
/* ================================================================== */

// csharp/index.astro: `IndexEntry` and `extractSummary`, verbatim.
interface IndexEntry {
  n: string;
  f: string;
  ns: string;
  k: string;
  p: string;
  s: string;
  t?: string;
  v?: string;
  a?: string;
}

function extractSummary(summary: any): string {
  if (!summary || !Array.isArray(summary)) return '';
  return summary
    .map((node: any) => {
      if (node.kind === 'text') return node.text;
      if (node.kind === 'cref') return node.value?.split('.').pop() ?? '';
      if (node.kind === 'paramref' || node.kind === 'typeparamref') return node.value ?? '';
      if (node.kind === 'langword') return node.value ?? '';
      return '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

const sortedPackages = packageEntries
  .map((p) => p.data)
  .sort((a, b) => a.package.name.localeCompare(b.package.name));
const csharpVersions = [...new Set(sortedPackages.map((p) => p.package.version).filter(Boolean))] as string[];
const csharpSearch: IndexEntry[] = [];
let typeCount = 0;
let memberCount = 0;

for (const pkg of sortedPackages) {
  const pkgName = pkg.package.name;
  const pkgVersion = pkg.package.version;
  for (const type of pkg.types) {
    typeCount++;
    const typeSlug = slugify(type.name, genericArity(type));
    csharpSearch.push({
      n: type.name,
      f: type.fullName ?? type.name,
      ns: type.namespace ?? '',
      k: type.kind ?? 'class',
      p: pkgName,
      s: extractSummary(type.docs?.summary),
      ...(typeSlug !== type.name.toLowerCase() ? { g: typeSlug } : {}),
      ...(pkgVersion ? { v: pkgVersion } : {}),
    });

    const members: any[] = type.members ?? [];
    const resolvedAnchors = resolveMemberAnchors(members);
    for (const [memberIndex, member] of members.entries()) {
      memberCount++;
      const memberName = member.name === '.ctor' ? `${type.name} (constructor)` : member.name;
      const memberFull = `${type.fullName ?? type.name}.${member.name === '.ctor' ? '.ctor' : member.name}`;
      const anchor = resolvedAnchors[memberIndex].exact;
      const nameAnchor = memberNameSlug(member);
      csharpSearch.push({
        n: memberName,
        f: memberFull,
        ns: type.namespace ?? '',
        k: member.kind ?? 'method',
        p: pkgName,
        s: extractSummary(member.docs?.summary),
        t: type.name,
        ...(anchor !== nameAnchor ? { a: anchor } : {}),
        ...(typeSlug !== type.name.toLowerCase() ? { ts: typeSlug } : {}),
        ...(pkgVersion ? { v: pkgVersion } : {}),
      });
    }
  }
}

// typescript/index.astro
const sortedModules = moduleEntries
  .map((p) => p.data)
  .sort((a, b) => a.package.name.localeCompare(b.package.name));
const typescriptVersions = [...new Set(sortedModules.map((p) => p.package.version).filter(Boolean))] as string[];
const typescriptSearch = buildTsApiSearchIndex(sortedModules as any, '');

/* ================================================================== */
/*  Sidebars                                                           */
/* ================================================================== */

const csharpSidebars = new Map<string, unknown>();
for (const route of csharpPackages) {
  csharpSidebars.set(route.slug, await getApiReferenceSidebar({ packageName: route.package }));
}
const typescriptSidebars = new Map<string, unknown>();
for (const route of typescriptModules) {
  typescriptSidebars.set(
    route.slug,
    await getTsApiReferenceSidebar({ packageName: route.module, headings: moduleHeadingsByName.get(route.module)! })
  );
}

/* ================================================================== */
/*  xref-names.json: what <ApiReference name> resolves to              */
/* ================================================================== */

const CALLABLE_KINDS = new Set(['method', 'constructor', 'Method', 'InstanceMethod']);
const packageDocs = packageEntries.map((entry) => entry.data);

interface XrefName extends RenderedApiReference {
  package?: string;
  packages?: Record<string, RenderedApiReference>;
  overloads?: (RenderedApiReference & { parameterTypes: string[] })[];
}

const xrefNames: Record<string, XrefName> = {};
let overloadCount = 0;
{
  const provider = new CSharpLanguageProvider();
  const csharpIndex = provider.buildIndex(packageDocs as any);
  for (const group of provider.enumerate(csharpIndex)) {
    const entry: XrefName = renderApiReference(apiReferenceIndex.resolve(group.fqn));
    const packageNames = [...group.matchesByPackage.keys()].sort();
    if (packageNames.length === 1) {
      entry.package = packageNames[0];
    } else {
      entry.packages = Object.fromEntries(
        packageNames.map((name) => [name, renderApiReference(apiReferenceIndex.resolve(group.fqn, name))])
      );
    }

    const seen = new Set<string>();
    const overloads: NonNullable<XrefName['overloads']> = [];
    for (const candidate of group.allMatches) {
      for (const member of candidate.members) {
        if (!member.kind || !CALLABLE_KINDS.has(member.kind)) continue;
        const parameterTypes = (member.parameters ?? []).map((parameter) => parameter.type);
        const key = JSON.stringify(parameterTypes);
        if (seen.has(key)) continue;
        seen.add(key);
        overloads.push({
          parameterTypes,
          ...renderApiReference(apiReferenceIndex.resolve(group.fqn, undefined, parameterTypes)),
        });
      }
    }
    if (overloads.length > 0) {
      entry.overloads = overloads;
      overloadCount += overloads.length;
    }
    xrefNames[group.fqn] = entry;
  }
}

/* ================================================================== */
/*  xref.json: doc ids (cref values) -> pages                          */
/* ================================================================== */

// Documentation comment ids (the `T:`/`M:`/`P:`/`F:` cref format of the C# compiler) built from the data:
// generic types and methods take `N and ``N, parameter types are fully qualified with {} type arguments,
// type parameters become `i (type) or ``i (method), ref/out/in parameters end with @, `T?` of a value type
// is System.Nullable{T}, constructors are #ctor, indexers Item, conversion operators end with ~ReturnType.

const keywordTypes: Record<string, string> = {
  bool: 'System.Boolean',
  byte: 'System.Byte',
  sbyte: 'System.SByte',
  char: 'System.Char',
  decimal: 'System.Decimal',
  double: 'System.Double',
  float: 'System.Single',
  int: 'System.Int32',
  uint: 'System.UInt32',
  nint: 'System.IntPtr',
  nuint: 'System.UIntPtr',
  long: 'System.Int64',
  ulong: 'System.UInt64',
  short: 'System.Int16',
  ushort: 'System.UInt16',
  object: 'System.Object',
  string: 'System.String',
  void: 'System.Void',
  dynamic: 'System.Object',
};

// Value types whose `T?` is System.Nullable{T}: the keyword structs, the structs and enums of the data,
// BCL structs, and every type the compiler wrote as System.Nullable{...} in a cref of the data.
const valueTypes = new Set<string>([
  ...Object.entries(keywordTypes)
    .filter(([keyword]) => !['object', 'string', 'void', 'dynamic'].includes(keyword))
    .map(([, type]) => type),
  'System.TimeSpan',
  'System.DateTime',
  'System.DateTimeOffset',
  'System.DateOnly',
  'System.TimeOnly',
  'System.Guid',
  'System.Half',
  'System.Int128',
  'System.UInt128',
  'System.Threading.CancellationToken',
]);

type TypeNode =
  | { kind: 'named'; segments: { name: string; args: TypeNode[] }[] }
  | { kind: 'tuple'; elements: TypeNode[] }
  | { kind: 'array'; element: TypeNode; rank: number }
  | { kind: 'pointer'; element: TypeNode }
  | { kind: 'nullable'; element: TypeNode };

function parseType(text: string): TypeNode {
  let pos = 0;
  const ws = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  };
  const ident = () => {
    const start = pos;
    while (pos < text.length && /[\w@]/.test(text[pos])) pos++;
    return text.slice(start, pos);
  };
  const type = (): TypeNode => {
    ws();
    let node: TypeNode;
    if (text[pos] === '(') {
      pos++;
      const elements: TypeNode[] = [];
      for (;;) {
        elements.push(type());
        ws();
        if (/[\w@]/.test(text[pos] ?? '')) ident(); // tuple element name
        ws();
        if (text[pos] === ',') {
          pos++;
          continue;
        }
        if (text[pos] === ')') pos++;
        break;
      }
      node = { kind: 'tuple', elements };
    } else {
      const segments: { name: string; args: TypeNode[] }[] = [];
      for (;;) {
        ws();
        let name = ident();
        if (text.startsWith('::', pos)) {
          pos += 2;
          name = ident(); // global::
        }
        const args: TypeNode[] = [];
        ws();
        if (text[pos] === '<') {
          pos++;
          for (;;) {
            args.push(type());
            ws();
            if (text[pos] === ',') {
              pos++;
              continue;
            }
            if (text[pos] === '>') pos++;
            break;
          }
        }
        segments.push({ name, args });
        if (text[pos] === '.') {
          pos++;
          continue;
        }
        break;
      }
      node = { kind: 'named', segments };
    }
    for (;;) {
      ws();
      if (text[pos] === '?') {
        pos++;
        node = { kind: 'nullable', element: node };
      } else if (text[pos] === '[') {
        const end = text.indexOf(']', pos);
        const rank = text.slice(pos + 1, end).split(',').length;
        pos = end + 1;
        node = { kind: 'array', element: node, rank };
      } else if (text[pos] === '*') {
        pos++;
        node = { kind: 'pointer', element: node };
      } else {
        break;
      }
    }
    return node;
  };
  return type();
}

interface GenericScope {
  typeParameters: { name: string; constraints?: string[] }[];
  methodParameters: { name: string; constraints?: string[] }[];
}

function namedFullName(node: TypeNode & { kind: 'named' }): string {
  return node.segments.map((segment) => segment.name).join('.');
}

function genericParameter(node: TypeNode, scope: GenericScope) {
  if (node.kind !== 'named' || node.segments.length !== 1 || node.segments[0].args.length) return undefined;
  const name = node.segments[0].name;
  const methodIndex = scope.methodParameters.findIndex((parameter) => parameter.name === name);
  if (methodIndex >= 0) return { id: `\`\`${methodIndex}`, parameter: scope.methodParameters[methodIndex] };
  const typeIndex = scope.typeParameters.findIndex((parameter) => parameter.name === name);
  if (typeIndex >= 0) return { id: `\`${typeIndex}`, parameter: scope.typeParameters[typeIndex] };
  return undefined;
}

function isValueType(node: TypeNode, scope: GenericScope): boolean {
  if (node.kind === 'tuple') return true;
  if (node.kind !== 'named') return false;
  const generic = genericParameter(node, scope);
  if (generic) return (generic.parameter.constraints ?? []).some((c) => c === 'struct' || c === 'unmanaged');
  const name = namedFullName(node);
  return valueTypes.has(keywordTypes[name] ?? name);
}

function docTypeId(node: TypeNode, scope: GenericScope): string {
  switch (node.kind) {
    case 'named': {
      const generic = genericParameter(node, scope);
      if (generic) return generic.id;
      if (node.segments.length === 1 && !node.segments[0].args.length && keywordTypes[node.segments[0].name]) {
        return keywordTypes[node.segments[0].name];
      }
      return node.segments
        .map((segment) =>
          segment.args.length
            ? `${segment.name}{${segment.args.map((arg) => docTypeId(arg, scope)).join(',')}}`
            : segment.name
        )
        .join('.');
    }
    case 'tuple':
      return `System.ValueTuple{${node.elements.map((element) => docTypeId(element, scope)).join(',')}}`;
    case 'array':
      return `${docTypeId(node.element, scope)}${node.rank === 1 ? '[]' : `[${Array(node.rank).fill('0:').join(',')}]`}`;
    case 'pointer':
      return `${docTypeId(node.element, scope)}*`;
    case 'nullable':
      return isValueType(node.element, scope)
        ? `System.Nullable{${docTypeId(node.element, scope)}}`
        : docTypeId(node.element, scope);
  }
}

/** `Ns.Outer<T>.Inner` -> `Ns.Outer`1.Inner` */
function docTypeName(type: any): string {
  const fullName = type.fullName ?? `${type.namespace ? `${type.namespace}.` : ''}${type.name}`;
  const node = parseType(fullName);
  if (node.kind !== 'named') return fullName;
  return node.segments.map((segment) => (segment.args.length ? `${segment.name}\`${segment.args.length}` : segment.name)).join('.');
}

const memberIdPrefixes: Record<string, string> = {
  method: 'M',
  constructor: 'M',
  property: 'P',
  indexer: 'P',
  field: 'F',
  event: 'E',
};

function docMemberId(typeName: string, type: any, member: any): string | undefined {
  const prefix = memberIdPrefixes[member.kind];
  if (!prefix) return undefined;
  const scope: GenericScope = {
    typeParameters: type.genericParameters ?? [],
    methodParameters: member.kind === 'method' ? (member.genericParameters ?? []) : [],
  };
  const name =
    member.name === '.ctor'
      ? '#ctor'
      : member.name === '.cctor'
        ? '#cctor'
        : member.kind === 'indexer'
          ? 'Item'
          : member.name.replace(/\./g, '#').replace(/</g, '{').replace(/>/g, '}');
  let id = `${prefix}:${typeName}.${name}`;
  if (scope.methodParameters.length) id += `\`\`${scope.methodParameters.length}`;
  const parameters: any[] = member.parameters ?? [];
  if (['method', 'constructor', 'indexer'].includes(member.kind) && parameters.length) {
    id += `(${parameters
      .map((parameter) => {
        const byRef = ['ref', 'out', 'in', 'ref readonly'].includes(parameter.modifier ?? '');
        return `${docTypeId(parseType(parameter.type), scope)}${byRef ? '@' : ''}`;
      })
      .join(',')})`;
  }
  if ((member.name === 'op_Implicit' || member.name === 'op_Explicit') && member.returnType) {
    id += `~${docTypeId(parseType(member.returnType), scope)}`;
  }
  return id;
}

// Value types of the data, and the System.Nullable{...} arguments of its crefs.
const crefValues = new Set<string>();
function collectCrefs(node: unknown): void {
  if (Array.isArray(node)) {
    for (const child of node) collectCrefs(child);
  } else if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (record.kind === 'cref' && typeof record.value === 'string') crefValues.add(record.value);
    for (const [key, value] of Object.entries(record)) {
      if (key === 'seeAlso' && Array.isArray(value)) {
        for (const item of value) if (typeof item === 'string') crefValues.add(item);
      }
      if (value && typeof value === 'object') collectCrefs(value);
    }
  }
}
for (const pkg of packageDocs) {
  for (const type of pkg.types as any[]) {
    if (['struct', 'record struct', 'enum'].includes(type.kind) && type.fullName) {
      valueTypes.add(normalizeTypeName(type.fullName));
    }
    collectCrefs(type.docs);
    for (const member of type.members ?? []) collectCrefs(member.docs);
  }
}
for (const cref of crefValues) {
  for (const match of cref.matchAll(/System\.Nullable\{([\w.]+)\}/g)) valueTypes.add(match[1]);
}

// TypeScript twins of types: the TypeScript item with the same full name, in the module of the package first.
const tsTypeUrls = new Map<string, string[]>();
for (const entry of moduleEntries) {
  const doc: any = entry.data;
  const topLevelItems = getTsTopLevelRouteItems(doc);
  for (const item of [...doc.handleTypes, ...doc.dtoTypes, ...doc.enumTypes]) {
    if (!item.fullName) continue;
    const url = `${API}/typescript/${tsModuleSlug(doc.package.name)}/${getTsItemSlug(item, topLevelItems)}/`;
    for (const key of [`${doc.package.name}\0${normalizeTypeName(item.fullName)}`, `\0${normalizeTypeName(item.fullName)}`]) {
      const urls = tsTypeUrls.get(key) ?? [];
      if (!urls.includes(url)) urls.push(url);
      tsTypeUrls.set(key, urls);
    }
  }
}

function tsTypeTwin(packageName: string, type: any): string | undefined {
  const fullName = normalizeTypeName(type.fullName ?? type.name);
  const own = tsTypeUrls.get(`${packageName}\0${fullName}`);
  if (own?.length === 1) return own[0];
  const global = tsTypeUrls.get(`\0${fullName}`);
  return global?.length === 1 ? global[0] : undefined;
}

/** The TypeScript page the AspireExport mapping of the api-reference providers gives a member, if any. */
function tsMemberTwin(packageName: string, type: any, member: any): string | undefined {
  const fqn = `${normalizeTypeName(type.fullName ?? `${type.namespace ? `${type.namespace}.` : ''}${type.name}`)}.${member.name}`;
  const resolution = CALLABLE_KINDS.has(member.kind)
    ? apiReferenceIndex.resolve(fqn, packageName, (member.parameters ?? []).map((p: any) => p.type))
    : apiReferenceIndex.resolve(fqn, packageName);
  return resolution.status === 'resolved' ? resolution.targets?.typescript?.path : undefined;
}

interface XrefEntry {
  url: string;
  kind: string;
  package: string;
  ts?: string;
}

const xref: Record<string, XrefEntry> = {};
const xrefDuplicates: string[] = [];
function addXref(id: string, value: XrefEntry) {
  if (xref[id]) {
    xrefDuplicates.push(`${id} (${xref[id].package}, ${value.package})`);
    return;
  }
  if (value.ts === undefined) delete value.ts;
  xref[id] = value;
}

for (const pkg of packageDocs) {
  const pkgName = pkg.package.name;
  for (const type of pkg.types as any[]) {
    const typeSlug = slugify(type.name, genericArity(type));
    if (!typeSlug) continue;
    const typeUrl = typeHref('/', pkgName, type.name, genericArity(type));
    const typeName = docTypeName(type);
    addXref(`T:${typeName}`, { url: typeUrl, kind: type.kind, package: pkgName, ts: tsTypeTwin(pkgName, type) });

    const members: any[] = type.members ?? [];
    const anchors = resolveMemberAnchors(members);
    members.forEach((member, index) => {
      const id = docMemberId(typeName, type, member);
      const kindSlug = memberKindSlugs[member.kind];
      if (!id || !kindSlug) return;
      addXref(id, {
        url: `${typeUrl}${kindSlug}/#${anchors[index].exact}`,
        kind: member.kind,
        package: pkgName,
        ts: tsMemberTwin(pkgName, type, member),
      });
    });

    for (const enumMember of type.enumMembers ?? []) {
      addXref(`F:${typeName}.${enumMember.name}`, {
        url: `${typeUrl}#enum-members`,
        kind: 'enum member',
        package: pkgName,
      });
    }
  }
}

// How many crefs of the data that point at a documented type or member find their xref entry.
const documentedTypes = new Set(Object.keys(xref).filter((id) => id.startsWith('T:')).map((id) => id.slice(2)));
const crefCheck = { documented: 0, found: 0, missing: [] as string[] };
for (const cref of crefValues) {
  const match = /^([TMPFE]):(.*)$/.exec(cref);
  if (!match) continue;
  const [, prefix, rest] = match;
  const withoutSignature = rest.replace(/[(~].*$/, '').replace(/``\d+$/, '');
  const declaringType = prefix === 'T' ? withoutSignature : withoutSignature.slice(0, withoutSignature.lastIndexOf('.'));
  if (!documentedTypes.has(declaringType)) continue;
  crefCheck.documented++;
  if (xref[cref]) crefCheck.found++;
  else crefCheck.missing.push(cref);
}

/* ================================================================== */
/*  Write                                                              */
/* ================================================================== */

const written: string[] = [];

/** Arrays and maps are written one element per line, so diffs stay readable; small files are indented. */
function writeJson(relativePath: string, value: unknown, style: 'lines' | 'pretty' = 'lines') {
  const file = path.join(outDir, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  let text: string;
  if (style === 'pretty') {
    text = JSON.stringify(value, null, 2);
  } else if (Array.isArray(value)) {
    text = value.length ? `[\n${value.map((item) => JSON.stringify(item)).join(',\n')}\n]` : '[]';
  } else {
    const entries = Object.entries(value as Record<string, unknown>);
    text = entries.length
      ? `{\n${entries.map(([key, item]) => `${JSON.stringify(key)}:${JSON.stringify(item)}`).join(',\n')}\n}`
      : '{}';
  }
  writeFileSync(file, `${text}\n`);
  written.push(relativePath);
}

function sortedObject<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

rmSync(outDir, { recursive: true, force: true });

// The pages read the API data as site data: api.pkgs[route.file], api["ts-modules"][route.file].
for (const folder of ['pkgs', 'ts-modules']) {
  cpSync(path.join(frontendRoot, 'src/data', folder), path.join(outDir, folder), { recursive: true });
}

writeJson('routes/indexes.json', [
  { url: `${API}/csharp/`, md: markdownPath(`${API}/csharp/`), language: 'csharp' },
  { url: `${API}/typescript/`, md: markdownPath(`${API}/typescript/`), language: 'typescript' },
]);
writeJson('routes/csharp-packages.json', csharpPackages);
writeJson('routes/csharp-types.json', csharpTypes);
writeJson('routes/csharp-members.json', csharpMembers);
writeJson('routes/typescript-modules.json', typescriptModules);
writeJson('routes/typescript-items.json', typescriptItems);
writeJson('routes/typescript-members.json', typescriptMembers);
writeJson('legacy-md.json', legacyMd, 'pretty');
writeJson('xref.json', sortedObject(xref));
writeJson('xref-names.json', sortedObject(xrefNames));
writeJson('search-csharp.json', csharpSearch);
writeJson('search-typescript.json', typescriptSearch);
writeJson('sidebar/csharp.json', await getApiReferenceSidebar(), 'pretty');
writeJson('sidebar/typescript.json', await getTsApiReferenceSidebar(), 'pretty');
for (const [slug, sidebar] of csharpSidebars) writeJson(`sidebar/csharp/${slug}.json`, sidebar, 'pretty');
for (const [slug, sidebar] of typescriptSidebars) writeJson(`sidebar/typescript/${slug}.json`, sidebar, 'pretty');

const duplicates = (routes: { url: string }[]) => routes.length - new Set(routes.map((route) => route.url)).size;
const counts = {
  csharp: {
    index: 1,
    packages: csharpPackages.length,
    types: csharpTypes.length,
    members: csharpMembers.length,
  },
  typescript: {
    index: 1,
    modules: typescriptModules.length,
    items: typescriptItems.length,
    members: typescriptMembers.length,
    legacyMd: legacyMd.length,
  },
  html: 0,
  md: 0,
  landing: {
    csharp: {
      packages: sortedPackages.length,
      types: typeCount,
      members: memberCount,
      kinds: [...new Set(csharpSearch.map((entry) => entry.k))].sort(),
      versions: csharpVersions,
      statsText: `${typeCount.toLocaleString('en-US')} types and ${memberCount.toLocaleString('en-US')} members across ${sortedPackages.length.toLocaleString('en-US')} packages`,
    },
    typescript: {
      modules: sortedModules.length,
      kinds: [...new Set(typescriptSearch.map((entry) => entry.k))].sort(),
      versions: typescriptVersions,
      statsText: formatTsApiSearchStats(getTsApiSearchStats(typescriptSearch)),
    },
  },
};
counts.html =
  2 + csharpPackages.length + csharpTypes.length + csharpMembers.length +
  typescriptModules.length + typescriptItems.length + typescriptMembers.length;
counts.md = counts.html + legacyMd.length;
writeJson('counts.json', counts, 'pretty');

/* ---- report ------------------------------------------------------- */

const size = (relativePath: string) => statSync(path.join(outDir, relativePath)).size;
const human = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

console.log(`Wrote ${path.relative(process.cwd(), outDir) || outDir}:`);
const sidebarFiles = { csharp: [0, 0], typescript: [0, 0] };
for (const relativePath of written) {
  const match = /^sidebar\/(csharp|typescript)\//.exec(relativePath);
  if (match) {
    const totals = sidebarFiles[match[1] as 'csharp' | 'typescript'];
    totals[0]++;
    totals[1] += size(relativePath);
    continue;
  }
  console.log(`  ${relativePath.padEnd(34)} ${human(size(relativePath)).padStart(10)}`);
}
for (const [language, [count, bytes]] of Object.entries(sidebarFiles)) {
  console.log(`  ${`sidebar/${language}/*.json`.padEnd(34)} ${human(bytes).padStart(10)}  (${count} files)`);
}

console.log('\nPages:');
console.log(`  C#          index 1, packages ${csharpPackages.length}, types ${csharpTypes.length}, member pages ${csharpMembers.length}`);
console.log(`  TypeScript  index 1, modules ${typescriptModules.length}, items ${typescriptItems.length}, member pages ${typescriptMembers.length}, legacy .md ${legacyMd.length}`);
const duplicateUrls = [csharpPackages, csharpTypes, csharpMembers, typescriptModules, typescriptItems, typescriptMembers]
  .map(duplicates)
  .reduce((a, b) => a + b, 0);
console.log(`  duplicate urls: ${duplicateUrls}`);

console.log('\nCross references:');
console.log(`  xref.json        ${Object.keys(xref).length} doc ids, ${Object.values(xref).filter((entry) => entry.ts).length} with a TypeScript twin, ${xrefDuplicates.length} duplicate ids skipped`);
console.log(`  xref-names.json  ${Object.keys(xrefNames).length} names, ${overloadCount} overloads`);
console.log(`  crefs of the data pointing at documented APIs: ${crefCheck.found}/${crefCheck.documented} found in xref.json`);
for (const cref of crefCheck.missing.slice(0, 10)) console.log(`    missing: ${cref}`);
if (xrefDuplicates.length) for (const id of xrefDuplicates.slice(0, 10)) console.log(`    duplicate: ${id}`);
