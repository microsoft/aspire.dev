import fs from 'fs';
import fetch from 'node-fetch';

const SERVICE_INDEX = 'https://api.nuget.org/v3/index.json';
const API_QUERIES = [
  'owner:aspire',
  'Aspire.Hosting.',
  'CommunityToolkit.Aspire',
];
const EXCLUDED_PACKAGES = [
  'Aspire.Cli',
  'Aspire.Hosting',
  'Aspire.Hosting.Azure',
  'Aspire.Hosting.IncrementalMigration',
  'Aspire.Hosting.NodeJs',
  'Aspire.MongoDB.Driver.v3',
  'Aspire.RabbitMQ.Client.v7'
];
const OUTPUT_PATH = './src/data/aspire-integrations.json';

// According to documentation, nuget.org limits:
// - 'take' parameter to 1,000
// - 'skip' parameter to 3,000 :contentReference[oaicite:5]{index=5}
const TAKE = 1000;
const MAX_SKIP = 3000;

async function discoverBase() {
  const res = await fetch(SERVICE_INDEX);
  const idx = await res.json();
  const svc = idx.resources.find(r =>
    r['@type']?.startsWith('SearchQueryService')
  );
  if (!svc) throw new Error('SearchQueryService not in service index');
  return svc['@id'];
}

async function discoverRegistrationBase() {
  const res = await fetch(SERVICE_INDEX);
  const idx = await res.json();
  const regs = (idx.resources || []).filter(r => r['@type']?.startsWith('RegistrationsBaseUrl'));
  if (!regs.length) throw new Error('RegistrationsBaseUrl not in service index');
  // Prefer semver2 gz endpoint for complete metadata
  const byPreference = [
    r => /registration5-gz-semver2/i.test(r['@id'] || ''),
    r => /registration5-semver2/i.test(r['@id'] || ''),
    r => /registration5-gz/i.test(r['@id'] || ''),
    r => /registration5/i.test(r['@id'] || ''),
  ];
  let chosen = regs[0];
  for (const pred of byPreference) {
    const found = regs.find(pred);
    if (found) { chosen = found; break; }
  }
  const id = chosen['@id'];
  return id.endsWith('/') ? id : id + '/';
}

async function fetchAllFromQuery(base, q) {
  const all = [];
  let skip = 0;
  let total = null;

  while (true) {
    const url = `${base}?q=${encodeURIComponent(q)}&prerelease=true&semVerLevel=2.0.0&skip=${skip}&take=${TAKE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const json = await res.json();

    if (total === null) total = json.totalHits;
    console.debug(`📦 "${q}" → got ${json.data.length}/${total} (skip=${skip})`);
    all.push(...json.data);

    if (skip >= MAX_SKIP) {
      console.warn(`⚠️ Skip reached limit (${skip} ≥ ${MAX_SKIP}), stopping page loop.`);
      if (total > skip + json.data.length) {
        console.warn(`⚠️ Total hits (${total}) > retrieved (${skip + json.data.length}). Some packages may be missing.`);
      }
      break;
    }

    skip += TAKE;
    if (skip >= total) break;
  }

  return all;
}

function filterAndTransform(pkgs) {
  return pkgs
    .filter(pkg => {
      const id = pkg.id.toLowerCase();
      const excludedLower = EXCLUDED_PACKAGES.map(p => p.toLowerCase());
      return (
        (id.startsWith('aspire.') || id.startsWith('communitytoolkit.aspire')) &&
        pkg.verified === true &&
        // Some search responses may include 'deprecated' boolean or 'deprecation' object
        pkg.deprecated !== true &&
        !pkg.deprecation &&
        !excludedLower.includes(id) &&
        !['x86','x64','arm64','projecttemplates','apphost']
          .some(t => id.includes(t))
      );
    })
    .map(pkg => ({
      title: pkg.id,
      description: pkg.description,
      icon: pkg.iconUrl || 'https://www.nuget.org/Content/gallery/img/default-package-icon.svg',
      href: `https://www.nuget.org/packages/${pkg.id}`,
      tags: pkg.tags?.map(t => t.toLowerCase()) ?? [],
      downloads: pkg.totalDownloads,
      version: pkg.version,
    }));
}

async function filterOutDeprecatedWithRegistration(pkgs) {
  const regBase = await discoverRegistrationBase();
  console.log('🔗 Registration base:', regBase);
  // Light pre-filter in case search already flags deprecated
  const prefiltered = pkgs.filter(p => p.deprecated !== true && !p.deprecation);

  const concurrency = 10;
  const out = [];
  let i = 0;
  async function worker() {
    while (i < prefiltered.length) {
      const idx = i++;
      const p = prefiltered[idx];
  const preferred = await getPreferredNonDeprecatedVersion(regBase, p.id);
      if (preferred) {
        out.push({ ...p, version: preferred });
      }
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function parseSemVer(v) {
  // Strip build metadata
  const [core, ] = v.split('+', 1).concat('');
  const [nums, pre = ''] = core.split('-', 2).concat('');
  const [maj, min, pat] = nums.split('.').map(x => parseInt(x, 10) || 0);
  const preParts = pre === '' ? [] : pre.split('.').map(x => (x.match(/^\d+$/) ? { n: parseInt(x, 10) } : { s: x }));
  return { maj, min, pat, pre: preParts };
}

function cmpSemVer(a, b) {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  if (pa.maj !== pb.maj) return pa.maj - pb.maj;
  if (pa.min !== pb.min) return pa.min - pb.min;
  if (pa.pat !== pb.pat) return pa.pat - pb.pat;
  const aHasPre = pa.pre.length > 0;
  const bHasPre = pb.pre.length > 0;
  if (!aHasPre && !bHasPre) return 0;
  if (!aHasPre && bHasPre) return 1; // non-prerelease > prerelease
  if (aHasPre && !bHasPre) return -1;
  // Compare prerelease identifiers
  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i++) {
    const ai = pa.pre[i];
    const bi = pb.pre[i];
    if (ai == null) return -1; // shorter is lower precedence per semver when prerelease
    if (bi == null) return 1;
    if (ai.n != null && bi.n != null) {
      if (ai.n !== bi.n) return ai.n - bi.n;
    } else if (ai.s != null && bi.s != null) {
      if (ai.s !== bi.s) return ai.s < bi.s ? -1 : 1;
    } else {
      // numeric < alphanumeric
      return ai.n != null ? -1 : 1;
    }
  }
  return 0;
}

async function getAllRegistrationLeaves(regBase, id) {
  const pkgIdLower = id.toLowerCase();
  const idxUrl = `${regBase}${encodeURIComponent(pkgIdLower)}/index.json`;
  const idxRes = await fetch(idxUrl);
  if (!idxRes.ok) throw new Error(`Failed reg index for ${id} (${idxRes.status})`);
  const idxJson = await idxRes.json();
  const pages = idxJson.items || [];
  const leaves = [];
  const normalizePageUrl = (u) => {
    if (!u) return u;
    // Convert fragment page ref to actual page resource
    const i = u.indexOf('#page/');
    if (i !== -1) {
      // e.g. .../index.json#page/<lower>/<upper> -> .../page/<lower>/<upper>.json
      const base = u.substring(0, i);
      const rest = u.substring(i + '#page/'.length);
      const pageUrl = base.replace(/index\.json$/i, '') + 'page/' + rest;
      return pageUrl.endsWith('.json') ? pageUrl : pageUrl + '.json';
    }
    return u;
  };
  const scanPage = (page) => {
    for (const leaf of page.items || []) {
      const ce = leaf.catalogEntry || {};
      const version = (ce.version || leaf.version || '').trim();
      if (!version) continue;
      const isPrerelease = !!(ce.isPrerelease ?? (version.includes('-')));
      const listed = ce.listed !== false; // default true if missing
      const deprecated = !!(leaf.deprecation || ce.deprecation);
      leaves.push({ version, isPrerelease, listed, deprecated });
    }
  };
  for (const page of pages) {
    if (page.items) {
      scanPage(page);
    } else if (page['@id']) {
      const pageUrl = normalizePageUrl(page['@id']);
      const pageRes = await fetch(pageUrl);
      if (!pageRes.ok) continue;
      const pageJson = await pageRes.json();
      scanPage(pageJson);
    }
  }
  return leaves;
}

async function getPreferredNonDeprecatedVersion(regBase, id) {
  try {
  const leaves = await getAllRegistrationLeaves(regBase, id);
    if (leaves.length === 0) return null;
    // Prefer listed versions
    const listed = leaves.filter(l => l.listed);
    const pool = listed.length > 0 ? listed : leaves;
  const nonDeprecated = pool.filter(l => !l.deprecated);
  if (nonDeprecated.length === 0) return null;
  const hasAnyStable = pool.some(l => !l.isPrerelease);
  const nonDeprecatedStable = nonDeprecated.filter(l => !l.isPrerelease);
  // If the package has any stable releases but none are non-deprecated, treat the package as deprecated overall
  if (hasAnyStable && nonDeprecatedStable.length === 0) return null;
  // Otherwise, prefer stable non-deprecated; if no stable releases exist at all, allow prerelease
  const pickFrom = nonDeprecatedStable.length > 0 ? nonDeprecatedStable : nonDeprecated;
    // Pick highest per SemVer
    pickFrom.sort((a, b) => cmpSemVer(a.version, b.version));
    return pickFrom[pickFrom.length - 1].version;
  } catch (e) {
    console.warn(`⚠️ Error selecting preferred version for ${id}:`, e.message || e);
    return null;
  }
}

(async () => {
  try {
    const base = await discoverBase();
    console.log('🔗 Using:', base);

    const results = await Promise.all(API_QUERIES.map(q => fetchAllFromQuery(base, q)));
  const merged = results.flat();
  const unique = Object.values(
      merged.reduce((acc, pkg) => (acc[pkg.id] = pkg, acc), {})
    ).sort((a,b) => a.id.localeCompare(b.id));

  // Exclude deprecated packages using registration metadata
  const nonDeprecated = await filterOutDeprecatedWithRegistration(unique);
  const output = filterAndTransform(nonDeprecated);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`✅ Saved ${output.length} packages to ${OUTPUT_PATH}`);
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
