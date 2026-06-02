import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

import fetch from 'node-fetch';

const REPO = 'microsoft/aspire-samples';
const BRANCH = 'main';
const SAMPLES_DIR = 'samples';
const OUTPUT_PATH = './src/data/samples.json';
const ASSETS_DIR = './src/assets/samples';
const ASSETS_IMPORT_PREFIX = '~/assets/samples';
const GITHUB_API = 'https://api.github.com';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const TREE_BASE = `https://github.com/${REPO}/tree/${BRANCH}`;
const LEGACY_DOCS_HOST = 'https://learn.microsoft.com';
const ASPIRE_DOC_URL_REWRITES = [
  [
    `${LEGACY_DOCS_HOST}/${['dotnet', 'aspire', 'fundamentals', 'dashboard', 'explore'].join('/')}` +
      '#dashboard-authentication',
    'https://aspire.dev/dashboard/explore/#dashboard-authentication',
  ],
] as const;

const CONCURRENCY = 5;

const headers: Record<string, string> = {
  'User-Agent': 'aspire-samples-script',
  Accept: 'application/vnd.github.v3+json',
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
}

interface TagRule {
  tag: string;
  patterns: RegExp[];
}

interface ImageReference {
  full: string;
  alt: string;
  src: string;
}

interface DownloadedImage {
  filename: string;
  localPath: string;
  remoteUrl: string;
}

interface GitHubContentEntry {
  type: string;
  name: string;
}

interface GitTreeEntry {
  path: string;
  type: string;
}

interface GitTreeResponse {
  tree: GitTreeEntry[];
  truncated?: boolean;
}

interface SampleResult {
  name: string;
  title: string;
  description: string | null;
  href: string;
  readme: string;
  readmeRaw: string;
  tags: string[];
  thumbnail: string | null;
  appHost: AppHostKind | null;
  appHostPath: string | null;
  appHostCode: string | null;
}

type AppHostKind = 'typescript' | 'csproj' | 'file-based';

interface AppHostInfo {
  kind: AppHostKind;
  entryPath: string;
}

const TAG_RULES: TagRule[] = [
  { tag: 'csharp', patterns: [/\bC#\b/i, /\.NET\b/i, /\bcsproj\b/i] },
  { tag: 'python', patterns: [/\bPython\b/i, /\.py\b/] },
  { tag: 'javascript', patterns: [/\bJavaScript\b/i, /\bJS\b/, /\.js\b/] },
  {
    tag: 'typescript',
    patterns: [/\bTypeScript\b/i, /\bts-node\b/i, /\bapphost\.m?ts\b/i, /\.m?tsx?\b/],
  },
  { tag: 'node', patterns: [/\bNode\.?js\b/i, /\bnpm\b/i] },
  {
    tag: 'go',
    patterns: [
      /\bGolang\b/i,
      /\bGo\s+(?:app|service|project)\b/i,
      /\b(?:written|built)\s+(?:in|using)\s+Go\b/i,
      /\bGo\b.*\bGin\b/i,
    ],
  },
  { tag: 'redis', patterns: [/\bRedis\b/i] },
  { tag: 'postgresql', patterns: [/\bPostgre(?:SQL|s)\b/i, /\bNpgsql\b/i] },
  { tag: 'sql-server', patterns: [/\bSQL\s*Server\b/i, /\bMSSQL\b/i] },
  { tag: 'mysql', patterns: [/\bMySQL\b/i] },
  { tag: 'mongodb', patterns: [/\bMongoDB\b/i] },
  { tag: 'rabbitmq', patterns: [/\bRabbitMQ\b/i] },
  { tag: 'kafka', patterns: [/\bKafka\b/i] },
  { tag: 'prometheus', patterns: [/\bPrometheus\b/i] },
  { tag: 'grafana', patterns: [/\bGrafana\b/i] },
  { tag: 'docker', patterns: [/\bDocker\b/i] },
  { tag: 'azure', patterns: [/\bAzure\b/i] },
  { tag: 'azure-functions', patterns: [/\bAzure\s+Functions?\b/i] },
  { tag: 'azure-storage', patterns: [/\bAzure\s+Storage\b/i] },
  { tag: 'azure-service-bus', patterns: [/\bAzure\s+Service\s+Bus\b/i] },
  { tag: 'blazor', patterns: [/\bBlazor\b/i] },
  { tag: 'orleans', patterns: [/\bOrleans\b/i] },
  { tag: 'grpc', patterns: [/\bgRPC\b/i] },
  { tag: 'ef-core', patterns: [/\bEntity\s+Framework\s+Core\b/i, /\bEF\s*Core\b/i] },
  { tag: 'metrics', patterns: [/\bmetrics\b/i, /\bOpenTelemetry\b/i] },
  { tag: 'health-checks', patterns: [/\bhealth\s*check/i] },
  { tag: 'containers', patterns: [/\bcontainer\s+build\b/i, /\bcontaineriz/i] },
  { tag: 'databases', patterns: [/\bdatabase\b/i] },
  { tag: 'migrations', patterns: [/\bmigration/i] },
  { tag: 'volumes', patterns: [/\bvolume\s+mount/i, /\bvolume\b/i] },
  { tag: 'dashboard', patterns: [/\bdashboard\b/i] },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function detectTags(name: string, readme: string, appHost: AppHostKind | null): string[] {
  const corpus = `${name} ${readme}`;
  const tags = new Set<string>();

  for (const rule of TAG_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(corpus)) {
        tags.add(rule.tag);
        break;
      }
    }
  }

  // Knowing the AppHost kind is a stronger signal than README text. The
  // language used to define the AppHost is always part of the sample's
  // tech stack, so promote it to a tag if not already present.
  if (appHost === 'typescript') {
    tags.add('typescript');
  } else if (appHost === 'csproj' || appHost === 'file-based') {
    tags.add('csharp');
  }

  return [...tags].sort();
}

function detectAppHost(paths: readonly string[]): AppHostInfo | null {
  // Priority: TypeScript apphost wins because the file-based AppHost.cs
  // detection would otherwise catch sample mirrors that include both shapes.
  // Aspire 13.4 renamed the entry point from `apphost.ts` to `apphost.mts`
  // (with the generated SDK moving from `./.modules/` to `./.aspire/modules/`).
  // Both layouts continue to work and either may appear in samples, so the
  // regex accepts the legacy `.ts` extension and the current `.mts` one.
  for (const p of paths) {
    if (/(?:^|\/)apphost\.m?ts$/i.test(p)) {
      return { kind: 'typescript', entryPath: p };
    }
  }

  // csproj: locate the *AppHost.csproj and prefer its sibling entry-point .cs
  // file (AppHost.cs > Program.cs) because that's the code authors care about.
  // The .csproj XML itself is mostly boilerplate.
  for (const p of paths) {
    if (/(?:^|\/)[^/]*apphost\.csproj$/i.test(p)) {
      const dir = p.slice(0, p.lastIndexOf('/') + 1);
      const siblings = paths.filter(
        (q) => q.startsWith(dir) && !q.slice(dir.length).includes('/')
      );
      const appHostCs = siblings.find((q) => /(?:^|\/)apphost\.cs$/i.test(q));
      const programCs = siblings.find((q) => /(?:^|\/)program\.cs$/i.test(q));
      return { kind: 'csproj', entryPath: appHostCs ?? programCs ?? p };
    }
  }

  // file-based: a standalone AppHost.cs not paired with a *.AppHost.csproj.
  for (const p of paths) {
    if (/(?:^|\/)apphost\.cs$/i.test(p)) {
      return { kind: 'file-based', entryPath: p };
    }
  }

  return null;
}

function extractTitle(readme: string): string | null {
  const match = readme.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractDescription(readme: string): string | null {
  const lines = readme.split('\n');
  let started = false;
  const descriptionLines: string[] = [];

  for (const line of lines) {
    if (!started) {
      if (/^#\s+/.test(line)) {
        started = true;
      }
      continue;
    }

    if (/^##\s+/.test(line)) {
      break;
    }

    const trimmed = line.trim();
    if (trimmed === '') {
      if (descriptionLines.length > 0) {
        descriptionLines.push('');
      }
      continue;
    }

    if (/^!\[.*\]\(.*\)$/.test(trimmed)) {
      continue;
    }

    descriptionLines.push(trimmed);
  }

  while (descriptionLines.length > 0 && descriptionLines[descriptionLines.length - 1] === '') {
    descriptionLines.pop();
  }

  return descriptionLines.join('\n').trim() || null;
}

function resolveRemoteImageUrl(name: string, src: string): string {
  if (src.startsWith('http')) {
    return src;
  }

  const relative = src.startsWith('./') ? src.slice(2) : src;
  return `${RAW_BASE}/${SAMPLES_DIR}/${name}/${relative}`;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'aspire-samples-script' },
  });
  if (!res.ok) {
    console.warn(`  ⚠️  Failed to download image: ${url} (${res.status})`);
    return false;
  }

  if (!res.body) {
    console.warn(`  ⚠️  Failed to download image: ${url} (empty response body)`);
    return false;
  }

  ensureDir(path.dirname(destPath));
  const fileStream = fs.createWriteStream(destPath);

  try {
    await pipeline(res.body, fileStream);
    return true;
  } catch (error: unknown) {
    try {
      fs.unlinkSync(destPath);
    } catch {
      // Ignore cleanup failures for partial files.
    }
    console.warn(`  ⚠️  Failed to write image: ${destPath} (${getErrorMessage(error)})`);
    return false;
  }
}

function collectImageRefs(readme: string): ImageReference[] {
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const refs: ImageReference[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(readme)) !== null) {
    refs.push({ full: match[0], alt: match[1], src: match[2] });
  }

  return refs;
}

async function downloadAndRewriteImages(
  name: string,
  readme: string
): Promise<{ readme: string; images: DownloadedImage[] }> {
  const imageRefs = collectImageRefs(readme);
  if (imageRefs.length === 0) {
    return { readme, images: [] };
  }

  const sampleAssetsDir = path.join(ASSETS_DIR, name);
  let rewritten = readme;
  const downloadedImages: DownloadedImage[] = [];

  for (const ref of imageRefs) {
    const remoteUrl = resolveRemoteImageUrl(name, ref.src);
    const filename = path.basename(ref.src.split('?')[0]);
    const localPath = path.join(sampleAssetsDir, filename);
    const assetImportPath = `${ASSETS_IMPORT_PREFIX}/${name}/${filename}`;

    const ok = await downloadImage(remoteUrl, localPath);
    if (ok) {
      rewritten = rewritten.replace(ref.full, `![${ref.alt}](${assetImportPath})`);
      downloadedImages.push({ filename, localPath, remoteUrl });
      console.log(`  🖼️  Downloaded: ${filename}`);
    }
  }

  return { readme: rewritten, images: downloadedImages };
}

function extractThumbnail(_name: string, readme: string): string | null {
  const match = readme.match(/!\[.*?\]\((.+?)\)/);
  return match ? match[1] : null;
}

function rewriteAspireDocLinks(readme: string): string {
  let rewritten = readme;

  for (const [sourceUrl, destinationUrl] of ASPIRE_DOC_URL_REWRITES) {
    rewritten = rewritten.replaceAll(sourceUrl, destinationUrl);
  }

  return rewritten;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'aspire-samples-script' },
  });
  if (!res.ok) {
    return null;
  }
  return res.text();
}

async function listSampleDirs(): Promise<string[]> {
  const contents = await fetchJson<GitHubContentEntry[]>(
    `${GITHUB_API}/repos/${REPO}/contents/${SAMPLES_DIR}?ref=${BRANCH}`
  );

  return contents
    .filter((entry) => entry.type === 'dir')
    .map((entry) => entry.name)
    .sort();
}

/**
 * Fetch every blob path under `samples/` in a single recursive tree call so we
 * can inspect each sample's file layout (AppHost kind, project shape, etc.)
 * without making per-sample API requests.
 */
async function fetchSamplePaths(): Promise<Map<string, string[]>> {
  const tree = await fetchJson<GitTreeResponse>(
    `${GITHUB_API}/repos/${REPO}/git/trees/${BRANCH}?recursive=1`
  );

  if (tree.truncated) {
    console.warn(
      '⚠️  GitHub returned a truncated git tree; AppHost detection may be incomplete.'
    );
  }

  const prefix = `${SAMPLES_DIR}/`;
  const bySample = new Map<string, string[]>();

  for (const entry of tree.tree) {
    if (entry.type !== 'blob') continue;
    if (!entry.path.startsWith(prefix)) continue;

    const relative = entry.path.slice(prefix.length);
    const slashIndex = relative.indexOf('/');
    if (slashIndex === -1) continue;

    const sampleName = relative.slice(0, slashIndex);
    const filePath = relative.slice(slashIndex + 1);

    const existing = bySample.get(sampleName);
    if (existing) {
      existing.push(filePath);
    } else {
      bySample.set(sampleName, [filePath]);
    }
  }

  return bySample;
}

async function fetchReadme(sampleName: string): Promise<string | null> {
  const url = `${RAW_BASE}/${SAMPLES_DIR}/${sampleName}/README.md`;
  return fetchText(url);
}

async function fetchAppHostCode(
  sampleName: string,
  entryPath: string
): Promise<string | null> {
  const url = `${RAW_BASE}/${SAMPLES_DIR}/${sampleName}/${entryPath}`;
  const content = await fetchText(url);
  if (!content) return null;
  // Normalize line endings and trim trailing whitespace per line so the
  // rendered code block is stable across runs.
  return content.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trimEnd();
}

async function processSample(
  name: string,
  filePaths: readonly string[]
): Promise<SampleResult | null> {
  const rawReadme = await fetchReadme(name);
  if (!rawReadme) {
    console.warn(`⚠️  No README.md found for sample: ${name}`);
    return null;
  }

  const { readme: imageRewrittenReadme } = await downloadAndRewriteImages(name, rawReadme);
  const readme = rewriteAspireDocLinks(imageRewrittenReadme);

  const appHostInfo = detectAppHost(filePaths);
  const appHostCode = appHostInfo
    ? await fetchAppHostCode(name, appHostInfo.entryPath)
    : null;

  const title = extractTitle(readme) || name;
  const description = extractDescription(readme);
  const tags = detectTags(name, readme, appHostInfo?.kind ?? null);
  const thumbnail = extractThumbnail(name, readme);
  const href = `${TREE_BASE}/${SAMPLES_DIR}/${name}`;

  return {
    name,
    title,
    description,
    href,
    readme,
    readmeRaw: rawReadme,
    tags,
    thumbnail,
    appHost: appHostInfo?.kind ?? null,
    appHostPath: appHostInfo?.entryPath ?? null,
    appHostCode,
  };
}

async function main(): Promise<void> {
  console.log(`📦 Fetching sample directories from ${REPO}...`);
  const [dirs, pathsBySample] = await Promise.all([listSampleDirs(), fetchSamplePaths()]);
  console.log(`📂 Found ${dirs.length} sample directories`);

  const results: SampleResult[] = [];
  for (let index = 0; index < dirs.length; index += CONCURRENCY) {
    const batch = dirs.slice(index, index + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((name) => processSample(name, pathsBySample.get(name) ?? []))
    );
    for (const result of batchResults) {
      if (result) {
        results.push(result);
        const appHostLabel = result.appHost ? ` · AppHost: ${result.appHost}` : '';
        console.log(`  ✅ ${result.name} — ${result.tags.length} tags${appHostLabel}`);
      }
    }
  }

  results.sort((a, b) => a.name.localeCompare(b.name));

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n✅ Saved ${results.length} samples to ${OUTPUT_PATH}`);
}

main().catch((error: unknown) => {
  console.error('❌ Error:', getErrorMessage(error));
  process.exit(1);
});
