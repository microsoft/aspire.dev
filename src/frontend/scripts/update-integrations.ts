import fs from 'fs';

import { fetchWithProxy as fetch } from './fetch-with-proxy';
import {
  NUGET_ORG_SERVICE_INDEX,
  isOfficialAspirePackage,
  resolveOfficialAspirePackageSource,
} from './aspire-package-source';

const OFFICIAL_NUGET_ORG_QUERIES = ['owner:aspire', 'Aspire.Hosting.'];
const OFFICIAL_RELEASE_FEED_QUERIES = ['Aspire.'];
const COMMUNITY_TOOLKIT_QUERIES = ['CommunityToolkit.Aspire'];
const EXCLUDED_PACKAGES = [
  'Aspire.Cli',
  'Aspire.Hosting.IncrementalMigration',
  'Aspire.Hosting.NodeJs',
  'Aspire.Microsoft.AspNetCore.SystemWebAdapters',
  'Aspire.MongoDB.Driver.v3',
  'Aspire.RabbitMQ.Client.v7',
  'CommunityToolkit.Aspire.Hosting.Azure.StaticWebApps',
  'CommunityToolkit.Aspire.Hosting.EventStore',
  'CommunityToolkit.Aspire.EventStore',
];
const OUTPUT_PATH = './src/data/aspire-integrations.json';

const TAKE = 1000;
const MAX_SKIP = 3000;

interface NuGetResource {
  '@type'?: string;
  '@id'?: string;
}

interface ServiceIndexResponse {
  resources?: NuGetResource[];
}

interface CatalogEntry {
  version?: string;
  isPrerelease?: boolean;
  listed?: boolean;
  deprecation?: unknown;
}

interface RegistrationLeafEntry {
  catalogEntry?: CatalogEntry;
  version?: string;
  deprecation?: unknown;
}

interface RegistrationPage {
  items?: RegistrationLeafEntry[];
  '@id'?: string;
}

interface RegistrationIndexResponse {
  items?: RegistrationPage[];
}

interface PackageRecord {
  id: string;
  version?: string;
  description?: string;
  iconUrl?: string;
  tags?: string[];
  totalDownloads?: number;
  verified?: boolean;
  deprecated?: boolean;
  deprecation?: unknown;
  __registrationBase?: string;
  __trustedSource?: boolean;
  __sourcePriority?: number;
  __iconVersion?: string;
}

interface SearchResponse {
  totalHits?: number;
  data?: PackageRecord[];
}

interface RegistrationLeaf {
  version: string;
  isPrerelease: boolean;
  listed: boolean;
  deprecated: boolean;
}

interface PackageSource {
  label: string;
  priority: number;
  trusted: boolean;
  serviceIndex: string;
  queries: string[];
}

interface IntegrationOutput {
  title: string;
  description?: string;
  icon: string;
  href: string;
  tags: string[];
  downloads?: number;
  version?: string;
}

type PrereleaseIdentifier = { n: number } | { s: string };

interface ParsedSemVer {
  maj: number;
  min: number;
  pat: number;
  pre: PrereleaseIdentifier[];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function discoverBase(serviceIndex: string): Promise<string> {
  const res = await fetch(serviceIndex);
  const idx = (await res.json()) as ServiceIndexResponse;
  const svc = idx.resources?.find((resource) =>
    resource['@type']?.startsWith('SearchQueryService')
  );
  if (!svc?.['@id']) {
    throw new Error('SearchQueryService not in service index');
  }
  return svc['@id'];
}

async function discoverRegistrationBase(serviceIndex: string): Promise<string> {
  const res = await fetch(serviceIndex);
  const idx = (await res.json()) as ServiceIndexResponse;
  const registrations = (idx.resources ?? []).filter((resource) =>
    resource['@type']?.startsWith('RegistrationsBaseUrl')
  );

  if (!registrations.length) {
    throw new Error('RegistrationsBaseUrl not in service index');
  }

  const byPreference = [
    (resource: NuGetResource) => /registration5-gz-semver2/i.test(resource['@id'] ?? ''),
    (resource: NuGetResource) => /registration5-semver2/i.test(resource['@id'] ?? ''),
    (resource: NuGetResource) => /registration5-gz/i.test(resource['@id'] ?? ''),
    (resource: NuGetResource) => /registration5/i.test(resource['@id'] ?? ''),
  ];

  let chosen = registrations[0];
  for (const predicate of byPreference) {
    const found = registrations.find(predicate);
    if (found) {
      chosen = found;
      break;
    }
  }

  const id = chosen['@id'];
  if (!id) {
    throw new Error('RegistrationsBaseUrl did not expose an @id');
  }
  return id.endsWith('/') ? id : `${id}/`;
}

async function fetchAllFromQuery(
  base: string,
  query: string,
  sourceLabel: string
): Promise<PackageRecord[]> {
  const all: PackageRecord[] = [];
  let skip = 0;
  let total: number | null = null;

  while (true) {
    const url = `${base}?q=${encodeURIComponent(query)}&prerelease=true&semVerLevel=2.0.0&skip=${skip}&take=${TAKE}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    const json = (await res.json()) as SearchResponse;
    const data = json.data ?? [];

    if (total === null) {
      total = json.totalHits ?? data.length;
    }

    console.debug(`📦 [${sourceLabel}] "${query}" → got ${data.length}/${total} (skip=${skip})`);
    all.push(...data);

    if (skip >= MAX_SKIP) {
      console.warn(`⚠️ Skip reached limit (${skip} ≥ ${MAX_SKIP}), stopping page loop.`);
      if (total > skip + data.length) {
        console.warn(
          `⚠️ Total hits (${total}) > retrieved (${skip + data.length}). Some packages may be missing.`
        );
      }
      break;
    }

    skip += TAKE;
    if (skip >= total) {
      break;
    }
  }

  return all;
}

function buildNuGetIconUrl(
  packageId: string | undefined,
  version: string | undefined
): string | null {
  const normalizedPackageId = packageId?.trim().toLowerCase();
  const normalizedVersion = version?.trim().toLowerCase();

  if (!normalizedPackageId || !normalizedVersion) {
    return null;
  }

  return `https://www.nuget.org/api/v2/package/${encodeURIComponent(normalizedPackageId)}/${encodeURIComponent(normalizedVersion)}?packageIcon=true`;
}

function buildNuGetFlatContainerIconUrl(
  packageId: string | undefined,
  version: string | undefined
): string | null {
  const normalizedPackageId = packageId?.trim().toLowerCase();
  const normalizedVersion = version?.trim().toLowerCase();

  if (!normalizedPackageId || !normalizedVersion) {
    return null;
  }

  return `https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(normalizedPackageId)}/${encodeURIComponent(normalizedVersion)}/icon`;
}

function resolveIconUrl(pkg: PackageRecord): string {
  if (isOfficialAspirePackage(pkg.id)) {
    return (
      buildNuGetFlatContainerIconUrl(pkg.id, pkg.__iconVersion) ||
      buildNuGetIconUrl(pkg.id, pkg.__iconVersion) ||
      'https://www.nuget.org/Content/gallery/img/default-package-icon.svg'
    );
  }

  return (
    pkg.iconUrl ||
    buildNuGetFlatContainerIconUrl(pkg.id, pkg.__iconVersion ?? pkg.version) ||
    buildNuGetIconUrl(pkg.id, pkg.__iconVersion ?? pkg.version) ||
    'https://www.nuget.org/Content/gallery/img/default-package-icon.svg'
  );
}

function filterAndTransform(pkgs: PackageRecord[]): IntegrationOutput[] {
  const excludedLower = EXCLUDED_PACKAGES.map((pkg) => pkg.toLowerCase());

  return pkgs
    .filter((pkg) => {
      const id = pkg.id.toLowerCase();
      return (
        (id.startsWith('aspire.') || id.startsWith('communitytoolkit.aspire')) &&
        (pkg.__trustedSource || pkg.verified === true) &&
        pkg.deprecated !== true &&
        !pkg.deprecation &&
        !excludedLower.includes(id) &&
        !['x86', 'x64', 'arm64', 'projecttemplates', 'apphost'].some((token) => id.includes(token))
      );
    })
    .map((pkg) => ({
      title: pkg.id,
      description: pkg.description
        ?.replace(/\bA \.NET Aspire\b/gi, 'An Aspire')
        .replace(/\.NET Aspire/gi, 'Aspire'),
      icon: resolveIconUrl(pkg),
      href: `https://www.nuget.org/packages/${pkg.id}`,
      tags: pkg.tags?.map((tag) => tag.toLowerCase()) ?? [],
      downloads: pkg.totalDownloads,
      version: pkg.version,
    }));
}

async function filterOutDeprecatedWithRegistration(
  pkgs: PackageRecord[]
): Promise<PackageRecord[]> {
  const prefiltered = pkgs.filter((pkg) => pkg.deprecated !== true && !pkg.deprecation);

  const concurrency = 10;
  const output: PackageRecord[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < prefiltered.length) {
      const currentIndex = nextIndex++;
      const pkg = prefiltered[currentIndex];

      const registrationBase = pkg.__registrationBase;
      if (!registrationBase) {
        continue;
      }

      const preferred = await getPreferredNonDeprecatedVersion(registrationBase, pkg.id);
      if (preferred) {
        output.push({ ...pkg, version: preferred });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return output.sort((a, b) => a.id.localeCompare(b.id));
}

function parseSemVer(version: string): ParsedSemVer {
  const [core = ''] = version.split('+', 1);
  const [numbers = '', preRelease = ''] = core.split('-', 2);
  const [maj, min, pat] = numbers.split('.').map((value) => Number.parseInt(value, 10) || 0);
  const pre =
    preRelease === ''
      ? []
      : preRelease.split('.').map((value): PrereleaseIdentifier => {
          return /^\d+$/.test(value) ? { n: Number.parseInt(value, 10) } : { s: value };
        });

  return { maj, min, pat, pre };
}

function cmpSemVer(a: string, b: string): number {
  const parsedA = parseSemVer(a);
  const parsedB = parseSemVer(b);
  if (parsedA.maj !== parsedB.maj) return parsedA.maj - parsedB.maj;
  if (parsedA.min !== parsedB.min) return parsedA.min - parsedB.min;
  if (parsedA.pat !== parsedB.pat) return parsedA.pat - parsedB.pat;

  const aHasPre = parsedA.pre.length > 0;
  const bHasPre = parsedB.pre.length > 0;
  if (!aHasPre && !bHasPre) return 0;
  if (!aHasPre && bHasPre) return 1;
  if (aHasPre && !bHasPre) return -1;

  const len = Math.max(parsedA.pre.length, parsedB.pre.length);
  for (let index = 0; index < len; index++) {
    const partA = parsedA.pre[index];
    const partB = parsedB.pre[index];
    if (partA == null) return -1;
    if (partB == null) return 1;
    if ('n' in partA && 'n' in partB) {
      if (partA.n !== partB.n) return partA.n - partB.n;
    } else if ('s' in partA && 's' in partB) {
      if (partA.s !== partB.s) return partA.s < partB.s ? -1 : 1;
    } else {
      return 'n' in partA ? -1 : 1;
    }
  }

  return 0;
}

async function getAllRegistrationLeaves(
  registrationBase: string,
  id: string
): Promise<RegistrationLeaf[]> {
  const packageIdLower = id.toLowerCase();
  const indexUrl = `${registrationBase}${encodeURIComponent(packageIdLower)}/index.json`;
  const indexResponse = await fetch(indexUrl);
  if (!indexResponse.ok) {
    throw new Error(`Failed reg index for ${id} (${indexResponse.status})`);
  }

  const indexJson = (await indexResponse.json()) as RegistrationIndexResponse;
  const pages = indexJson.items ?? [];
  const leaves: RegistrationLeaf[] = [];

  const normalizePageUrl = (value: string | undefined): string | undefined => {
    if (!value) {
      return value;
    }

    const pageIndex = value.indexOf('#page/');
    if (pageIndex !== -1) {
      const base = value.substring(0, pageIndex);
      const rest = value.substring(pageIndex + '#page/'.length);
      const pageUrl = `${base.replace(/index\.json$/i, '')}page/${rest}`;
      return pageUrl.endsWith('.json') ? pageUrl : `${pageUrl}.json`;
    }

    return value;
  };

  const scanPage = (page: RegistrationPage): void => {
    for (const leaf of page.items ?? []) {
      const catalogEntry = leaf.catalogEntry ?? {};
      const version = (catalogEntry.version ?? leaf.version ?? '').trim();
      if (!version) {
        continue;
      }

      leaves.push({
        version,
        isPrerelease: Boolean(catalogEntry.isPrerelease ?? version.includes('-')),
        listed: catalogEntry.listed !== false,
        deprecated: Boolean(leaf.deprecation || catalogEntry.deprecation),
      });
    }
  };

  for (const page of pages) {
    if (page.items) {
      scanPage(page);
      continue;
    }

    const pageUrl = normalizePageUrl(page['@id']);
    if (!pageUrl) {
      continue;
    }

    const pageResponse = await fetch(pageUrl);
    if (!pageResponse.ok) {
      continue;
    }

    const pageJson = (await pageResponse.json()) as RegistrationPage;
    scanPage(pageJson);
  }

  return leaves;
}

async function getPreferredNonDeprecatedVersion(
  registrationBase: string,
  id: string
): Promise<string | null> {
  try {
    const leaves = await getAllRegistrationLeaves(registrationBase, id);
    if (leaves.length === 0) {
      return null;
    }

    const listed = leaves.filter((leaf) => leaf.listed);
    const pool = listed.length > 0 ? listed : leaves;
    const nonDeprecated = pool.filter((leaf) => !leaf.deprecated);
    if (nonDeprecated.length === 0) {
      return null;
    }

    const hasAnyStable = pool.some((leaf) => !leaf.isPrerelease);
    const nonDeprecatedStable = nonDeprecated.filter((leaf) => !leaf.isPrerelease);
    if (hasAnyStable && nonDeprecatedStable.length === 0) {
      return null;
    }

    const pickFrom = nonDeprecatedStable.length > 0 ? nonDeprecatedStable : nonDeprecated;
    pickFrom.sort((a, b) => cmpSemVer(a.version, b.version));
    return pickFrom[pickFrom.length - 1].version;
  } catch (error: unknown) {
    console.warn(`⚠️ Error selecting preferred version for ${id}:`, getErrorMessage(error));
    return null;
  }
}

async function fetchPackagesFromSource(source: PackageSource): Promise<PackageRecord[]> {
  const [searchBase, registrationBase] = await Promise.all([
    discoverBase(source.serviceIndex),
    discoverRegistrationBase(source.serviceIndex),
  ]);

  console.log(`🔗 ${source.label}: ${searchBase}`);

  const results = await Promise.all(
    source.queries.map((query) => fetchAllFromQuery(searchBase, query, source.label))
  );

  return results.flat().map((pkg) => ({
    ...pkg,
    __registrationBase: registrationBase,
    __trustedSource: source.trusted,
    __sourcePriority: source.priority,
  }));
}

async function fetchNuGetOrgMetadata(packageIds: string[]): Promise<Map<string, PackageRecord>> {
  const ids = [...new Set(packageIds.filter(Boolean))];
  const metadataById = new Map<string, PackageRecord>();

  if (ids.length === 0) {
    return metadataById;
  }

  const searchBase = await discoverBase(NUGET_ORG_SERVICE_INDEX);
  const concurrency = 10;
  let nextIndex = 0;

  async function findPackageMetadata(packageId: string): Promise<PackageRecord | null> {
    const queries = [`packageid:${packageId}`, `"${packageId}"`, packageId];

    for (const query of queries) {
      const url = `${searchBase}?q=${encodeURIComponent(query)}&prerelease=true&semVerLevel=2.0.0&skip=0&take=20`;
      const res = await fetch(url);

      if (!res.ok) {
        continue;
      }

      const json = (await res.json()) as SearchResponse;
      const match = (json.data ?? []).find(
        (pkg) => pkg.id?.toLowerCase() === packageId.toLowerCase()
      );

      if (match) {
        return match;
      }
    }

    return null;
  }

  async function worker(): Promise<void> {
    while (nextIndex < ids.length) {
      const packageId = ids[nextIndex++];

      try {
        const metadata = await findPackageMetadata(packageId);
        if (metadata) {
          metadataById.set(packageId.toLowerCase(), metadata);
        }
      } catch (error: unknown) {
        console.warn(
          `⚠️ Unable to backfill nuget.org metadata for ${packageId}:`,
          getErrorMessage(error)
        );
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
  return metadataById;
}

function mergeFallbackPackageMetadata(
  packages: PackageRecord[],
  metadataById: Map<string, PackageRecord>
): PackageRecord[] {
  return packages.map((pkg) => {
    if (!isOfficialAspirePackage(pkg.id)) {
      return pkg;
    }

    const fallback = metadataById.get(pkg.id.toLowerCase());
    if (!fallback) {
      return pkg;
    }

    return {
      ...pkg,
      totalDownloads: fallback.totalDownloads ?? pkg.totalDownloads,
      description: pkg.description ?? fallback.description,
      tags: pkg.tags?.length ? pkg.tags : fallback.tags,
      iconUrl: fallback.iconUrl ?? pkg.iconUrl,
      __iconVersion: fallback.version ?? pkg.version,
    };
  });
}

void (async () => {
  try {
    const officialSource = resolveOfficialAspirePackageSource();
    if (officialSource.isReleaseBranch) {
      console.log(
        `🌿 Release branch detected (${officialSource.branchName}). Official Aspire packages will resolve from ${officialSource.displayName}.`
      );
    }

    const sources: PackageSource[] = [
      {
        label: officialSource.isReleaseBranch
          ? 'official Aspire release feed'
          : 'official Aspire (nuget.org)',
        priority: officialSource.isReleaseBranch ? 2 : 1,
        trusted: officialSource.isReleaseBranch,
        serviceIndex: officialSource.serviceIndex,
        queries: officialSource.isReleaseBranch
          ? OFFICIAL_RELEASE_FEED_QUERIES
          : OFFICIAL_NUGET_ORG_QUERIES,
      },
      {
        label: 'Community Toolkit (nuget.org)',
        priority: 0,
        trusted: false,
        serviceIndex: NUGET_ORG_SERVICE_INDEX,
        queries: COMMUNITY_TOOLKIT_QUERIES,
      },
    ];

    const results = await Promise.all(sources.map((source) => fetchPackagesFromSource(source)));
    const merged = results.flat();
    const uniqueById = merged.reduce<Record<string, PackageRecord>>((acc, pkg) => {
      const existing = acc[pkg.id];
      if (!existing || (pkg.__sourcePriority ?? 0) >= (existing.__sourcePriority ?? 0)) {
        acc[pkg.id] = pkg;
      }
      return acc;
    }, {});

    let unique = Object.values(uniqueById).sort((a, b) => a.id.localeCompare(b.id));

    if (officialSource.isReleaseBranch) {
      const nugetOrgMetadata = await fetchNuGetOrgMetadata(
        unique.filter((pkg) => isOfficialAspirePackage(pkg.id)).map((pkg) => pkg.id)
      );
      unique = mergeFallbackPackageMetadata(unique, nugetOrgMetadata);
    }

    const nonDeprecated = await filterOutDeprecatedWithRegistration(unique);
    const output = filterAndTransform(nonDeprecated);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`✅ Saved ${output.length} packages to ${OUTPUT_PATH}`);
  } catch (error: unknown) {
    console.error('❌ Error:', getErrorMessage(error));
    process.exitCode = 1;
  }
})();
