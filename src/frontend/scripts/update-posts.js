import fetch from 'node-fetch';
import { readFile, writeFile } from 'fs/promises';

const BSKY_IDENTIFIER = process.env.BSKY_IDENTIFIER;
const BSKY_APP_PASSWORD = process.env.BSKY_APP_PASSWORD;

const OUTPUT_PATH = './src/data/aspire-posts.json';
const LOGIN_URL = 'https://bsky.social/xrpc/com.atproto.server.createSession';
const SEARCH_URL = 'https://bsky.social/xrpc/app.bsky.feed.searchPosts';
const SEARCH_TERM = '#aspire';
const SINCE_DATE = '2023-11-14T00:00:00Z';
const MAX_POSTS = 500;

const EXCLUDED_HANDLES = new Set([
  'antz-junction.bsky.social', 'prevention-collaborative.org', 'aspire-cop.bsky.social',
  'blackrose-deguerre.bsky.social', 'neowin.net', 'new3rd.bsky.social', 'columbiaem.bsky.social',
  'um-ypl.bsky.social', 'frankschloegel.bsky.social', 'randomquotes.bsky.social', 'thedailyquotes.bsky.social',
  'lebotdelachatte.bsky.social', 'ceesslob.bsky.social', 'irbbarcelona.org', 'londontlife.bsky.social',
  'kerryreynoldsmd.bsky.social', 'darkpoint.bsky.social', 'finland.activitypub.awakari.com.ap.brid.gy',
  'oldperl.mastodon.online.ap.brid.gy', 'oncodaily.bsky.social', 'warrensmitchell.bsky.social',
  'luminousreflect.bsky.social', 'newsen.bsky.social', 'izumicat1.bsky.social', 'blesspat.bsky.social',
  'edchoicesmag.bsky.social', 'lncstrlgnd.bsky.social'
]);

const INCLUDE_TAGS = new Set([
  'llm', 'rag', 'aspire', 'dotnet', 'build', 'dapr', 'cloudnative', 'cloud',
  'dotnetaspire', 'yarp', 'aspnet', 'microservice', 'kubernetes', 'k8s',
  'blazor', 'ollama', 'ai', 'semantickernel', 'cosmos', 'db', 'fsharp',
  'azure', 'aws', 'community', 'dev', 'openai', 'scalar', 'csharp', 'maui',
  'dotnetmaui', 'docker', 'oss'
]);

const EXCLUDE_TAGS = new Set([
  'whiteycorporations', 'exploit', 'allhumans', 'communities', 'all', 'welcome',
  'audhd', 'dnd', 'writing', 'fanfic', 'origin', 'bloodhunter', 'dragonborn', 'acer',
  'originstory', 'bg3', 'inspired', 'darkfantasy', 'fantasy', 'suzydaviesbooks', 'iraes',
  'housiemousieseries', 'poopthedragon', 'readers', 'books', 'gifts', 'absorb', 'helpingcitizens',
  'specialoccasions', 'celebrations', 'birthdays', 'fathersday', 'raiseareader', 'streetart',
  'inspire', 'wellbeing', 'rolemodels', 'positivevibesonly', 'spelman', 'attire', 'penge',
  'morehouse', 'youthpolicylab', 'freeschoolmeals', 'poverty', 'childpoverty', 'idnont',
  'schoolfunding', 'labour', 'redtories', 'capitalism', 'towerhamlets', 'jpr', 'justice',
  'welfarenotwarfare', 'newparty', 'newworkersparty', 'tusc', 'achieve', 'isr', 'flowers',
  'tradeunionistandsocialistcoalition', 'peoplebeforeprofit', 'socialism', 'socialist',
  'youngpeople', 'manchester', 'manchesterrisingstarsfund', 'findoutmore', 'irresistible',
  'support', 'entrepreneurship', 'youngachievers', 'meghansussex', 'sussexsquad', 'oncsky'
]);

function extractTagsFromText(text) {
  const matches = text.match(/#\w+/g);
  return matches 
    ? Array.from(new Set(matches.map(tag => tag.slice(1).toLowerCase()))).sort((a, b) => a.localeCompare(b))
    : [];
}

function normalizeAuthorHandle(raw) {
  if (!raw) return '';
  const h = String(raw).toLowerCase();
  // If already contains a domain, keep as-is
  if (h.includes('.')) return h;
  // Otherwise assume bsky.social suffix to match excluded list entries
  return `${h}.bsky.social`;
}

function shouldIncludePost(post) {
  const text = post.record?.text || '';
  const tags = extractTagsFromText(text);
  const author = normalizeAuthorHandle(post.author?.handle);
  const createdAt = new Date(post.record?.createdAt);
  const minDate = new Date('2023-11-14T00:00:00Z');

  if (createdAt < minDate) return false;
  // Check both normalized (with domain) and bare handle against the excluded list
  const bare = author ? author.split('.')[0] : '';
  if ((author && EXCLUDED_HANDLES.has(author)) || (bare && EXCLUDED_HANDLES.has(bare))) return false;

  const hasIncluded = tags.some(t => INCLUDE_TAGS.has(t));
  const hasExcluded = tags.some(t => EXCLUDE_TAGS.has(t));

  return hasIncluded && !hasExcluded;
}

async function loginToBluesky() {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: BSKY_IDENTIFIER,
      password: BSKY_APP_PASSWORD
    })
  });

  if (!res.ok) {
    throw new Error(`Login failed: ${res.statusText}`);
  }

  const data = await res.json();
  return data.accessJwt;
}

async function fetchAspirePosts(accessToken, cursor = null, collected = []) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('q', SEARCH_TERM);
  url.searchParams.set('limit', 25);
  url.searchParams.set('since', SINCE_DATE);

  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url.href, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.statusText}`);
  }

  const data = await res.json();
  const posts = data.posts || [];
  collected.push(...posts);

  if (data.cursor && collected.length < MAX_POSTS) {
    return fetchAspirePosts(accessToken, data.cursor, collected);
  }

  return collected;
}

async function loadExistingPosts() {
  try {
    const content = await readFile(OUTPUT_PATH, 'utf8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function deduplicatePosts(existing, newPosts) {
  const map = new Map();

  for (const post of existing) {
    if (post && post.cid) map.set(post.cid, post);
  }
  for (const post of newPosts) {
    if (post && post.cid) map.set(post.cid, post);
  }

  const combined = Array.from(map.values());

  // Sort reverse-chronologically (newest first)
  combined.sort((a, b) => {
    const da = new Date(a.postedAt || a.record?.createdAt || 0).getTime();
    const db = new Date(b.postedAt || b.record?.createdAt || 0).getTime();
    return db - da;
  });

  return combined;
}

async function savePosts(posts) {
  await writeFile(OUTPUT_PATH, JSON.stringify(posts, null, 2));
}

async function updateAspirePosts() {
  if (!BSKY_IDENTIFIER || !BSKY_APP_PASSWORD) {
    console.error('❌ Missing BSKY_IDENTIFIER or BSKY_APP_PASSWORD in environment.');
    process.exit(1);
  }

  console.log('🔐 Logging into Bluesky...');
  const accessToken = await loginToBluesky();

  console.log('🔍 Fetching posts...');
  const posts = await fetchAspirePosts(accessToken);
  console.log(`📦 Fetched ${posts.length} posts.`);

  const filtered = posts.filter(shouldIncludePost);
  console.log(`✅ Filtered down to ${filtered.length} relevant Aspire posts.`);

  const existing = await loadExistingPosts();
  const all = deduplicatePosts(existing, filtered);

  console.log(`💾 Saving ${all.length} total posts.`);
  await savePosts(all);
}

updateAspirePosts().catch(err => {
  console.error('❌ Error updating aspire posts:', err);
  process.exit(1);
});
