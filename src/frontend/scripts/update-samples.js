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

const CONCURRENCY = 5;

const headers = {
  'User-Agent': 'aspire-samples-script',
  Accept: 'application/vnd.github.v3+json',
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
}

// ---------- Tag detection ----------

const TAG_RULES = [
  // Languages
  { tag: 'csharp', patterns: [/\bC#\b/i, /\.NET\b/i, /\bcsproj\b/i] },
  { tag: 'python', patterns: [/\bPython\b/i, /\.py\b/] },
  { tag: 'javascript', patterns: [/\bJavaScript\b/i, /\bJS\b/, /\.js\b/] },
  { tag: 'node', patterns: [/\bNode\.?js\b/i, /\bnpm\b/i] },
  { tag: 'go', patterns: [/\bGolang\b/i, /\bGo\s+(?:app|service|project)\b/i] },

  // Services & Technologies
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

  // Azure
  { tag: 'azure', patterns: [/\bAzure\b/i] },
  { tag: 'azure-functions', patterns: [/\bAzure\s+Functions?\b/i] },
  { tag: 'azure-storage', patterns: [/\bAzure\s+Storage\b/i] },
  { tag: 'azure-service-bus', patterns: [/\bAzure\s+Service\s+Bus\b/i] },

  // Frameworks & Features
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

function detectTags(name, readme) {
  const corpus = `${name} ${readme}`;
  const tags = new Set();

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

// ---------- README parsing ----------

function extractTitle(readme) {
  const match = readme.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractDescription(readme) {
  // Get text between the first # heading and the first ## heading (or end)
  const lines = readme.split('\n');
  let started = false;
  const descLines = [];

  for (const line of lines) {
    if (!started) {
      // Skip until we pass the first # heading
      if (/^#\s+/.test(line)) {
        started = true;
      }
      continue;
    }

    // Stop at next ## heading
    if (/^##\s+/.test(line)) break;

    // Skip image lines and empty lines at the start
    const trimmed = line.trim();
    if (trimmed === '') {
      if (descLines.length > 0) descLines.push('');
      continue;
    }

    // Skip standalone image references
    if (/^!\[.*\]\(.*\)$/.test(trimmed)) continue;

    descLines.push(trimmed);
  }

  // Clean up: trim trailing empty lines and join
  while (descLines.length > 0 && descLines[descLines.length - 1] === '') {
    descLines.pop();
  }

  return descLines.join(' ').replace(/\s+/g, ' ').trim() || null;
}

// ---------- Image downloading ----------

function resolveRemoteImageUrl(name, src) {
  if (src.startsWith('http')) return src;
  const relative = src.startsWith('./') ? src.slice(2) : src;
  return `${RAW_BASE}/${SAMPLES_DIR}/${name}/${relative}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function downloadImage(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'aspire-samples-script' },
  });
  if (!res.ok) {
    console.warn(`  ⚠️  Failed to download image: ${url} (${res.status})`);
    return false;
  }
  ensureDir(path.dirname(destPath));
  const fileStream = fs.createWriteStream(destPath);
  await pipeline(res.body, fileStream);
  return true;
}

function collectImageRefs(readme) {
  // Match all markdown image references: ![alt](src)
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const refs = [];
  let match;
  while ((match = regex.exec(readme)) !== null) {
    refs.push({ full: match[0], alt: match[1], src: match[2] });
  }
  return refs;
}

async function downloadAndRewriteImages(name, readme) {
  const imageRefs = collectImageRefs(readme);
  if (imageRefs.length === 0) return { readme, images: [] };

  const sampleAssetsDir = path.join(ASSETS_DIR, name);
  let rewritten = readme;
  const downloadedImages = [];

  for (const ref of imageRefs) {
    const remoteUrl = resolveRemoteImageUrl(name, ref.src);
    const filename = path.basename(ref.src.split('?')[0]); // strip query params
    const localPath = path.join(sampleAssetsDir, filename);
    const assetImportPath = `${ASSETS_IMPORT_PREFIX}/${name}/${filename}`;

    const ok = await downloadImage(remoteUrl, localPath);
    if (ok) {
      // Rewrite the markdown image reference to the local asset path
      rewritten = rewritten.replace(ref.full, `![${ref.alt}](${assetImportPath})`);
      downloadedImages.push({ filename, localPath, remoteUrl });
      console.log(`  🖼️  Downloaded: ${filename}`);
    }
  }

  return { readme: rewritten, images: downloadedImages };
}

function extractThumbnail(name, readme) {
  // Find the first image reference in the (already-rewritten) README
  const match = readme.match(/!\[.*?\]\((.+?)\)/);
  if (!match) return null;
  return match[1];
}

// ---------- GitHub API ----------

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'aspire-samples-script' },
  });
  if (!res.ok) return null;
  return res.text();
}

async function listSampleDirs() {
  const contents = await fetchJson(
    `${GITHUB_API}/repos/${REPO}/contents/${SAMPLES_DIR}?ref=${BRANCH}`
  );
  return contents
    .filter((entry) => entry.type === 'dir')
    .map((entry) => entry.name)
    .sort();
}

async function fetchReadme(sampleName) {
  const url = `${RAW_BASE}/${SAMPLES_DIR}/${sampleName}/README.md`;
  return fetchText(url);
}

// ---------- Main ----------

async function processSample(name) {
  const rawReadme = await fetchReadme(name);
  if (!rawReadme) {
    console.warn(`⚠️  No README.md found for sample: ${name}`);
    return null;
  }

  // Download images and rewrite paths in README
  const { readme, images } = await downloadAndRewriteImages(name, rawReadme);

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

async function main() {
  console.log(`📦 Fetching sample directories from ${REPO}...`);
  const dirs = await listSampleDirs();
  console.log(`📂 Found ${dirs.length} sample directories`);

  const results = [];
  // Process in batches for concurrency control
  for (let i = 0; i < dirs.length; i += CONCURRENCY) {
    const batch = dirs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((name) => processSample(name)));
    for (const result of batchResults) {
      if (result) {
        results.push(result);
        console.log(`  ✅ ${result.name} — ${result.tags.length} tags`);
      }
    }
  }

  // Sort by name
  results.sort((a, b) => a.name.localeCompare(b.name));

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n✅ Saved ${results.length} samples to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
