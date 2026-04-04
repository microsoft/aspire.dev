import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

import fetch from 'node-fetch';

const REPO = 'dotnet/aspire-samples';
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

interface SampleResult {
  name: string;
  title: string;
  description: string | null;
  href: string;
  readme: string;
  tags: string[];
  thumbnail: string | null;
}

const TAG_RULES: TagRule[] = [
  { tag: 'csharp', patterns: [/\bC#\b/i, /\.NET\b/i, /\bcsproj\b/i] },
  { tag: 'python', patterns: [/\bPython\b/i, /\.py\b/] },
  { tag: 'javascript', patterns: [/\bJavaScript\b/i, /\bJS\b/, /\.js\b/] },
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

function detectTags(name: string, readme: string): string[] {
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

  return [...tags].sort();
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

async function fetchReadme(sampleName: string): Promise<string | null> {
  const url = `${RAW_BASE}/${SAMPLES_DIR}/${sampleName}/README.md`;
  return fetchText(url);
}

async function processSample(name: string): Promise<SampleResult | null> {
  const rawReadme = await fetchReadme(name);
  if (!rawReadme) {
    console.warn(`⚠️  No README.md found for sample: ${name}`);
    return null;
  }

  const { readme: imageRewrittenReadme } = await downloadAndRewriteImages(name, rawReadme);
  const readme = rewriteAspireDocLinks(imageRewrittenReadme);

  const title = extractTitle(readme) || name;
  const description = extractDescription(readme);
  const tags = detectTags(name, readme);
  const thumbnail = extractThumbnail(name, readme);
  const href = `${TREE_BASE}/${SAMPLES_DIR}/${name}`;

  return {
    name,
    title,
    description,
    href,
    readme,
    tags,
    thumbnail,
  };
}

async function main(): Promise<void> {
  console.log(`📦 Fetching sample directories from ${REPO}...`);
  const dirs = await listSampleDirs();
  console.log(`📂 Found ${dirs.length} sample directories`);

  const results: SampleResult[] = [];
  for (let index = 0; index < dirs.length; index += CONCURRENCY) {
    const batch = dirs.slice(index, index + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((name) => processSample(name)));
    for (const result of batchResults) {
      if (result) {
        results.push(result);
        console.log(`  ✅ ${result.name} — ${result.tags.length} tags`);
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
