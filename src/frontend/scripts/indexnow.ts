/**
 * Tells IndexNow-participating search engines (Bing, Yandex, Naver, Seznam, Yep, Amazon) about
 * aspire.dev URLs. See https://www.indexnow.org/documentation.
 *
 * Every run reads the live sitemap, compares it with the URL list remembered from the previous run
 * and submits, in priority order:
 *   1. removed URLs (so engines drop them) and new URLs (so engines discover them),
 *   2. the next window of the rotation cycle, which walks the whole sitemap in (tier, path) order.
 *
 * The rotation cycle is a cursor over that order, so it survives URLs being added or removed. A
 * `flush` (a release merge or a manual dispatch) restarts the cycle from the top at the larger
 * release budget; the daily runs then drain it until the whole sitemap has been covered, after
 * which the slow rotation budget applies. IndexNow does not publish its rate limits, so both
 * budgets live in config/indexnow.json and a 429 simply pauses the run until the next one.
 *
 * State (`state.json` and `known-urls.txt.gz`) lives in --state-dir. The workflow keeps it between
 * runs as an Actions artifact; losing it only causes a cold start, which seeds the known URL list
 * without submitting every URL as "new".
 *
 * Usage (from src/frontend):
 *   pnpm indexnow --state-dir <dir> [--mode daily|flush] [--limit <n>] [--release <X.Y>]
 *                 [--trigger <name>] [--dry-run] [--allow-shrink]
 */
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';

import { locales } from '../config/locales';
import { fetchWithProxy } from './fetch-with-proxy';

export type FetchLike = typeof fetchWithProxy;
export type Sleep = (ms: number) => Promise<void>;
export type RunMode = 'daily' | 'flush';
export type CycleKind = 'release' | 'rotation';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface IndexNowConfig {
  host: string;
  key: string;
  endpoint: string;
  sitemapIndex: string;
  budgets: { release: number; rotation: number };
}

/** A pass over the sitemap. `cursor` is the last URL covered, in (tier, path) order. */
export interface Cycle {
  kind: CycleKind;
  reason: string;
  startedAt: string;
  cursor: string | null;
  /** URLs ahead of the cursor that were already submitted as new, so the window skips them. */
  skip: string[];
}

export interface RunRecord {
  at: string;
  trigger: string;
  mode: RunMode;
  coldStart: boolean;
  newUrls: number;
  removedUrls: number;
  windowUrls: number;
  submitted: number;
  statuses: number[];
}

export interface IndexNowState {
  host: string;
  updatedAt: string;
  /** The `git-commit-id` meta value served by the site when the state was written. */
  deployment: string;
  /** `null` once the previous cycle has covered the whole sitemap. */
  cycle: Cycle | null;
  lastRun: RunRecord | null;
  /** Every sitemap URL as of the last run, sorted. */
  known: string[];
}

const CONFIG_PATH = fileURLToPath(new URL('../config/indexnow.json', import.meta.url));
const STATE_FILE = 'state.json';
const KNOWN_FILE = 'known-urls.txt.gz';
const SCHEMA_VERSION = 1;
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
const USER_AGENT = 'aspire.dev-indexnow (+https://github.com/microsoft/aspire.dev)';

/** IndexNow accepts at most 10,000 URLs per POST. */
export const MAX_URLS_PER_REQUEST = 10_000;
/** Cap on new URLs, and separately on removed URLs, submitted ahead of the window in one run. */
const MAX_PRIORITY_URLS = 10_000;
export const MAX_LIMIT = 50_000;
/** A sitemap with fewer URLs than this share of the last known list is treated as broken. */
export const SHRINK_THRESHOLD = 0.8;
const MAX_SITEMAP_CHARS = 100_000_000;
const MAX_CHILD_SITEMAPS = 50;
const SITEMAP_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 60_000;
/** Back-off for 5xx and network errors. A 429 waits for its Retry-After header instead. */
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];
const MAX_RETRY_AFTER_MS = 300_000;
const CHUNK_PAUSE_MS = 2_000;
const GATE_INTERVAL_MS = 60_000;
const GATE_TIMEOUT_MS = 45 * 60_000;

export const LOCALE_CODES: ReadonlySet<string> = new Set(
  Object.keys(locales).filter((code) => code !== 'root')
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeAnnotation(message: string): string {
  return message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export const consoleLogger: Logger = {
  info: (message) => console.log(message),
  warn: (message) =>
    console.warn(
      process.env.GITHUB_ACTIONS === 'true'
        ? `::warning::${escapeAnnotation(message)}`
        : `warning: ${message}`
    ),
  error: (message) =>
    console.error(
      process.env.GITHUB_ACTIONS === 'true'
        ? `::error::${escapeAnnotation(message)}`
        : `error: ${message}`
    ),
};

// ---------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------

function isLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_LIMIT;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function parseConfig(value: unknown): IndexNowConfig {
  if (!isRecord(value)) throw new Error('The IndexNow config must be a JSON object');
  const { host, key, endpoint, sitemapIndex, budgets } = value;
  if (typeof host !== 'string' || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) {
    throw new Error('The IndexNow config needs a lowercase "host" such as aspire.dev');
  }
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new Error('The IndexNow "key" must be 8-128 characters of letters, digits, or dashes');
  }
  if (typeof endpoint !== 'string' || !isHttpsUrl(endpoint)) {
    throw new Error('The IndexNow "endpoint" must be an https URL');
  }
  if (
    typeof sitemapIndex !== 'string' ||
    !isHttpsUrl(sitemapIndex) ||
    new URL(sitemapIndex).hostname !== host
  ) {
    throw new Error('The IndexNow "sitemapIndex" must be an https URL on the configured host');
  }
  if (!isRecord(budgets) || !isLimit(budgets.release) || !isLimit(budgets.rotation)) {
    throw new Error(`The IndexNow "budgets" must be integers between 1 and ${MAX_LIMIT}`);
  }
  return {
    host,
    key,
    endpoint,
    sitemapIndex,
    budgets: { release: budgets.release, rotation: budgets.rotation },
  };
}

export async function loadConfig(configPath = CONFIG_PATH): Promise<IndexNowConfig> {
  const raw: unknown = JSON.parse(await readFile(configPath, 'utf8'));
  return parseConfig(raw);
}

export function keyLocation(config: Pick<IndexNowConfig, 'host' | 'key'>): string {
  return `https://${config.host}/${config.key}.txt`;
}

// ---------------------------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------------------------

export interface ParsedSitemap {
  kind: 'index' | 'urlset';
  locations: string[];
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g,
    (match: string, decimal?: string, hex?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name] ?? match;
      const code = decimal ? Number(decimal) : parseInt(hex ?? '', 16);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
  );
}

/**
 * Reads the `<loc>` values of a sitemap or sitemap index. The `xhtml:link` alternates that Astro
 * adds carry their URL in an attribute and are ignored: every localized page is also listed as a
 * `<url>` of its own.
 */
export function parseSitemap(xml: string): ParsedSitemap {
  const root = /<(sitemapindex|urlset)[\s>]/.exec(xml);
  if (!root) throw new Error('Not a sitemap: expected a <urlset> or <sitemapindex> element');
  const locations: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)) {
    const location = decodeXml(match[1]);
    if (location) locations.push(location);
  }
  return { kind: root[1] === 'sitemapindex' ? 'index' : 'urlset', locations };
}

async function fetchXml(fetch: FetchLike, url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml, text/xml' },
    signal: AbortSignal.timeout(SITEMAP_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_SITEMAP_CHARS) throw new Error(`${url} is larger than expected`);
  return text;
}

/** Returns every `<loc>` of the sitemap, following a sitemap index one level deep. */
export async function fetchSitemapLocations(
  indexUrl: string,
  fetch: FetchLike = fetchWithProxy
): Promise<string[]> {
  const first = parseSitemap(await fetchXml(fetch, indexUrl));
  if (first.kind === 'urlset') return first.locations;
  if (first.locations.length === 0) throw new Error(`${indexUrl} lists no sitemaps`);
  if (first.locations.length > MAX_CHILD_SITEMAPS) {
    throw new Error(`${indexUrl} lists more than ${MAX_CHILD_SITEMAPS} sitemaps`);
  }

  const host = new URL(indexUrl).hostname;
  const locations: string[] = [];
  for (const child of first.locations) {
    if (!isHttpsUrl(child) || new URL(child).hostname !== host) {
      throw new Error(`Refusing to read sitemap ${child}: it is not an https URL on ${host}`);
    }
    const parsed = parseSitemap(await fetchXml(fetch, child));
    if (parsed.kind !== 'urlset') throw new Error(`${child} is a nested sitemap index`);
    for (const location of parsed.locations) locations.push(location);
  }
  return locations;
}

/** Keeps only https URLs on `host`, drops fragments and removes duplicates. */
export function normalizeUrls(
  locations: readonly string[],
  host: string
): { urls: string[]; rejected: string[] } {
  const urls = new Set<string>();
  const rejected: string[] = [];
  for (const location of locations) {
    let url: URL;
    try {
      url = new URL(location);
    } catch {
      rejected.push(location);
      continue;
    }
    if (
      url.protocol !== 'https:' ||
      url.hostname !== host ||
      url.port ||
      url.username ||
      url.password
    ) {
      rejected.push(location);
      continue;
    }
    url.hash = '';
    urls.add(url.href);
  }
  return { urls: [...urls], rejected };
}

// ---------------------------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------------------------

/**
 * Priority of a page. Lower tiers are submitted first: English pages (docs, integrations, What's
 * new), then the API reference, then localized pages.
 */
export function tierOf(pathname: string, codes: ReadonlySet<string> = LOCALE_CODES): 0 | 1 | 2 {
  const first = pathname.split('/')[1] ?? '';
  if (codes.has(first)) return 2;
  if (pathname.startsWith('/reference/api/')) return 1;
  return 0;
}

interface Entry {
  url: string;
  tier: number;
}

function toEntry(url: string, codes: ReadonlySet<string>): Entry {
  return { url, tier: tierOf(new URL(url).pathname, codes) };
}

function compareEntries(a: Entry, b: Entry): number {
  return a.tier - b.tier || compareOrdinal(a.url, b.url);
}

/** Orders URLs by (tier, URL), the order the rotation cursor walks. */
export function compareUrls(a: string, b: string, codes: ReadonlySet<string> = LOCALE_CODES) {
  return compareEntries(toEntry(a, codes), toEntry(b, codes));
}

function firstIndexAfter(entries: readonly Entry[], target: Entry): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareEntries(entries[middle], target) > 0) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** How many of the URLs a cycle with this cursor has already covered. */
export function countCovered(
  urls: readonly string[],
  cursor: string | null,
  codes: ReadonlySet<string> = LOCALE_CODES
): number {
  if (cursor === null) return 0;
  const target = toEntry(cursor, codes);
  return urls.filter((url) => compareEntries(toEntry(url, codes), target) <= 0).length;
}

// ---------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------

export interface PlanInput {
  /** Normalized, de-duplicated sitemap URLs. */
  current: readonly string[];
  state: IndexNowState | null;
  mode: RunMode;
  /** Recorded on the cycle when one is started. */
  reason: string;
  budgets: IndexNowConfig['budgets'];
  /** Replaces the budget for this run. */
  limit?: number;
  now: Date;
  allowShrink?: boolean;
  localeCodes?: ReadonlySet<string>;
}

export interface Plan {
  coldStart: boolean;
  mode: RunMode;
  budget: number;
  /** The cycle this run works on (continued or newly started). */
  cycle: Cycle;
  total: number;
  /** Every URL that is in the sitemap but was not known. */
  newUrls: string[];
  /** Every known URL that left the sitemap. */
  removedUrls: string[];
  /** The removed URLs submitted this run, in submission order. */
  removed: string[];
  /** The new URLs submitted this run, in submission order. */
  fresh: string[];
  /** The rotation window submitted this run. */
  window: string[];
  /** The last URL the window scan went past, or null when it did not move. */
  windowEnd: string | null;
  /** True when a fully accepted window finishes the cycle. */
  windowComplete: boolean;
  /** How many sitemap URLs the cycle has covered after this run's scan. */
  covered: number;
  localeCodes: ReadonlySet<string>;
}

/**
 * Decides what to submit. Pure: it does not touch the network or the disk.
 *
 * - A cold start (no state) seeds the known list and never treats the whole sitemap as new.
 * - A flush starts a release cycle from the top; otherwise the active cycle continues, or a new
 *   rotation cycle begins when the previous one has completed.
 * - New and removed URLs go first. New URLs ahead of the cursor are remembered in `cycle.skip`
 *   (see finalizeRun) so the window does not send them a second time.
 */
export function planRun(input: PlanInput): Plan {
  const localeCodes = input.localeCodes ?? LOCALE_CODES;
  const { state } = input;
  const entries = input.current.map((url) => toEntry(url, localeCodes)).sort(compareEntries);
  const total = entries.length;
  if (total === 0) throw new Error('The sitemap lists no URLs; refusing to continue');

  const previous = state?.known ?? [];
  if (state && !input.allowShrink && total < previous.length * SHRINK_THRESHOLD) {
    throw new Error(
      `The sitemap lists ${total} URLs, more than ${Math.round((1 - SHRINK_THRESHOLD) * 100)}% ` +
        `fewer than the ${previous.length} known from the last run. Refusing to continue in case ` +
        'the site was only partially deployed; rerun with --allow-shrink if the drop is intended.'
    );
  }

  const currentSet = new Set(entries.map((entry) => entry.url));
  const knownSet = new Set(previous);
  const newUrls = state ? entries.filter((e) => !knownSet.has(e.url)).map((e) => e.url) : [];
  const removedUrls = previous
    .filter((url) => !currentSet.has(url))
    .map((url) => toEntry(url, localeCodes))
    .sort(compareEntries)
    .map((entry) => entry.url);

  const startedAt = input.now.toISOString();
  let cycle: Cycle;
  if (input.mode === 'flush') {
    cycle = { kind: 'release', reason: input.reason, startedAt, cursor: null, skip: [] };
  } else if (state?.cycle) {
    cycle = state.cycle;
  } else {
    cycle = { kind: 'rotation', reason: input.reason, startedAt, cursor: null, skip: [] };
  }

  const budget =
    input.limit ?? (cycle.kind === 'release' ? input.budgets.release : input.budgets.rotation);
  const removed = removedUrls.slice(0, MAX_PRIORITY_URLS);
  const fresh = newUrls.slice(0, MAX_PRIORITY_URLS);
  const priority = new Set([...removed, ...fresh]);
  const skip = new Set(cycle.skip);
  const room = Math.max(0, budget - removed.length - fresh.length);

  const alreadySent = (entry: Entry) => priority.has(entry.url) || skip.has(entry.url);
  let index =
    cycle.cursor === null ? 0 : firstIndexAfter(entries, toEntry(cycle.cursor, localeCodes));
  let windowEnd: string | null = null;
  const window: string[] = [];
  while (index < total && window.length < room) {
    const entry = entries[index++];
    windowEnd = entry.url;
    if (!alreadySent(entry)) window.push(entry.url);
  }
  // Trailing URLs that were already sent this cycle do not need another run to be passed over.
  while (index < total && alreadySent(entries[index])) windowEnd = entries[index++].url;

  return {
    coldStart: state === null,
    mode: input.mode,
    budget,
    cycle,
    total,
    newUrls,
    removedUrls,
    removed,
    fresh,
    window,
    windowEnd,
    windowComplete: index >= total,
    covered: index,
    localeCodes,
  };
}

export interface FinalizeOptions {
  host: string;
  /** The URLs the plan was computed from. */
  current: readonly string[];
  /** How many URLs of `[...removed, ...fresh, ...window]` were accepted, as a prefix. */
  accepted: number;
  now: Date;
  trigger: string;
  deployment: string;
  statuses: readonly number[];
}

/**
 * Builds the state to remember after a run. Only accepted URLs count as done: a new URL that was
 * not accepted stays new, a removed URL that was not accepted stays known, and the cursor stops at
 * the last accepted window URL.
 */
export function finalizeRun(plan: Plan, options: FinalizeOptions): IndexNowState {
  const ordered = [...plan.removed, ...plan.fresh, ...plan.window];
  const accepted = Math.min(Math.max(options.accepted, 0), ordered.length);
  const acceptedUrls = new Set(ordered.slice(0, accepted));
  const acceptedWindow = Math.max(0, accepted - plan.removed.length - plan.fresh.length);

  const known = new Set(options.current);
  for (const url of plan.newUrls) if (!acceptedUrls.has(url)) known.delete(url);
  for (const url of plan.removedUrls) if (!acceptedUrls.has(url)) known.add(url);

  let cycle: Cycle | null = null;
  const windowDone = acceptedWindow === plan.window.length;
  if (!(windowDone && plan.windowComplete)) {
    const cursor = windowDone
      ? (plan.windowEnd ?? plan.cycle.cursor)
      : (plan.window[acceptedWindow - 1] ?? plan.cycle.cursor);
    const skip = new Set(plan.cycle.skip);
    for (const url of plan.fresh) if (acceptedUrls.has(url)) skip.add(url);
    cycle = {
      ...plan.cycle,
      cursor,
      skip: [...skip]
        .filter((url) => cursor === null || compareUrls(url, cursor, plan.localeCodes) > 0)
        .sort(compareOrdinal),
    };
  }

  return {
    host: options.host,
    updatedAt: options.now.toISOString(),
    deployment: options.deployment,
    cycle,
    lastRun: {
      at: options.now.toISOString(),
      trigger: options.trigger,
      mode: plan.mode,
      coldStart: plan.coldStart,
      newUrls: plan.newUrls.length,
      removedUrls: plan.removedUrls.length,
      windowUrls: acceptedWindow,
      submitted: accepted,
      statuses: [...options.statuses],
    },
    known: [...known].sort(compareOrdinal),
  };
}

// ---------------------------------------------------------------------------------------------
// State on disk
// ---------------------------------------------------------------------------------------------

function parseCycle(value: unknown): Cycle | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error('"cycle" must be an object or null');
  const { kind, reason, startedAt, cursor, skip } = value;
  if (
    (kind !== 'release' && kind !== 'rotation') ||
    typeof reason !== 'string' ||
    typeof startedAt !== 'string' ||
    !(cursor === null || typeof cursor === 'string') ||
    !Array.isArray(skip) ||
    !skip.every((url): url is string => typeof url === 'string')
  ) {
    throw new Error('"cycle" has an unexpected shape');
  }
  return { kind, reason, startedAt, cursor, skip };
}

function parseRunRecord(value: unknown): RunRecord | null {
  if (!isRecord(value)) return null;
  const count = (entry: unknown) => (typeof entry === 'number' ? entry : 0);
  return {
    at: typeof value.at === 'string' ? value.at : '',
    trigger: typeof value.trigger === 'string' ? value.trigger : '',
    mode: value.mode === 'flush' ? 'flush' : 'daily',
    coldStart: value.coldStart === true,
    newUrls: count(value.newUrls),
    removedUrls: count(value.removedUrls),
    windowUrls: count(value.windowUrls),
    submitted: count(value.submitted),
    statuses: Array.isArray(value.statuses)
      ? value.statuses.filter((status): status is number => typeof status === 'number')
      : [],
  };
}

export async function loadState(
  dir: string,
  host: string,
  log: Logger = consoleLogger
): Promise<IndexNowState | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(dir, STATE_FILE), 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return null;
    throw error;
  }

  try {
    const file: unknown = JSON.parse(raw);
    if (!isRecord(file) || file.schemaVersion !== SCHEMA_VERSION) {
      throw new Error('the state file has a different schema version');
    }
    if (file.host !== host) throw new Error(`the state belongs to ${String(file.host)}`);
    if (typeof file.updatedAt !== 'string' || typeof file.deployment !== 'string') {
      throw new Error('the state file is missing fields');
    }
    const known = gunzipSync(await readFile(path.join(dir, KNOWN_FILE)))
      .toString('utf8')
      .split('\n')
      .filter(Boolean);
    if (known.length !== file.knownCount) {
      throw new Error(`expected ${String(file.knownCount)} known URLs but found ${known.length}`);
    }
    return {
      host,
      updatedAt: file.updatedAt,
      deployment: file.deployment,
      cycle: parseCycle(file.cycle),
      lastRun: parseRunRecord(file.lastRun),
      known,
    };
  } catch (error) {
    log.warn(`Ignoring unusable IndexNow state (${errorMessage(error)}); starting cold.`);
    return null;
  }
}

export async function saveState(dir: string, state: IndexNowState): Promise<void> {
  await mkdir(dir, { recursive: true });
  const stateFile = path.join(dir, STATE_FILE);
  const knownFile = path.join(dir, KNOWN_FILE);
  const stagedState = `${stateFile}.${process.pid}.next`;
  const stagedKnown = `${knownFile}.${process.pid}.next`;
  const { known, ...rest } = state;
  try {
    await writeFile(stagedKnown, gzipSync(`${known.join('\n')}\n`));
    await writeFile(
      stagedState,
      `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...rest, knownCount: known.length }, null, 2)}\n`,
      'utf8'
    );
    await rename(stagedKnown, knownFile);
    await rename(stagedState, stateFile);
  } finally {
    await rm(stagedKnown, { force: true });
    await rm(stagedState, { force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------------------------

export interface ChunkResult {
  size: number;
  status: number;
  attempts: number;
}

export interface SubmitStop {
  reason: 'rate-limited' | 'failed';
  status: number;
  detail: string;
}

export interface SubmitResult {
  /** URLs accepted by IndexNow: always a prefix of the list that was submitted. */
  accepted: number;
  chunks: ChunkResult[];
  stop: SubmitStop | null;
}

export interface SubmitOptions {
  config: IndexNowConfig;
  urls: readonly string[];
  fetch?: FetchLike;
  sleep?: Sleep;
  now?: () => number;
  log?: Logger;
}

/** Reads a Retry-After header, either as seconds or as an HTTP date, into milliseconds. */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, date - nowMs);
}

interface PostAttempt {
  /** HTTP status, or 0 when the request itself failed. */
  status: number;
  detail: string;
  retryAfter?: number;
}

async function postOnce(
  config: IndexNowConfig,
  body: string,
  fetch: FetchLike,
  now: () => number
): Promise<PostAttempt> {
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': USER_AGENT },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return {
      status: response.status,
      retryAfter: parseRetryAfter(response.headers.get('retry-after'), now()),
      detail: (await response.text()).trim().slice(0, 300),
    };
  } catch (error) {
    return { status: 0, detail: errorMessage(error) };
  }
}

async function postChunk(
  config: IndexNowConfig,
  urls: readonly string[],
  fetch: FetchLike,
  sleep: Sleep,
  now: () => number,
  log: Logger
): Promise<ChunkResult & { detail: string }> {
  const body = JSON.stringify({
    host: config.host,
    key: config.key,
    keyLocation: keyLocation(config),
    urlList: urls,
  });

  for (let attempt = 1; ; attempt++) {
    const { status, detail, retryAfter } = await postOnce(config, body, fetch, now);
    const result = { size: urls.length, status, attempts: attempt, detail };
    if (status === 200 || status === 202) return result;
    const retryable = status === 0 || status === 429 || status >= 500;
    const delay = status === 429 ? retryAfter : RETRY_DELAYS_MS[attempt - 1];
    if (
      !retryable ||
      attempt > RETRY_DELAYS_MS.length ||
      delay === undefined ||
      delay > MAX_RETRY_AFTER_MS
    ) {
      return result;
    }
    log.warn(
      `IndexNow answered ${status || 'with a network error'}; retrying in ${Math.ceil(delay / 1000)}s.`
    );
    await sleep(delay);
  }
}

/**
 * POSTs the URLs in chunks of at most 10,000. Chunks are all-or-nothing, so `accepted` is a
 * prefix of `urls`. A 429 (after honouring a short Retry-After) or any other failure stops the
 * run; the caller keeps the progress made so far.
 */
export async function submitUrls(options: SubmitOptions): Promise<SubmitResult> {
  const {
    config,
    urls,
    fetch = fetchWithProxy,
    sleep = defaultSleep,
    now = Date.now,
    log = consoleLogger,
  } = options;
  const chunks: ChunkResult[] = [];
  let accepted = 0;

  for (let offset = 0; offset < urls.length; offset += MAX_URLS_PER_REQUEST) {
    if (offset > 0) await sleep(CHUNK_PAUSE_MS);
    const chunk = urls.slice(offset, offset + MAX_URLS_PER_REQUEST);
    const { detail, ...result } = await postChunk(config, chunk, fetch, sleep, now, log);
    chunks.push(result);
    if (result.status === 200 || result.status === 202) {
      accepted += chunk.length;
      log.info(`IndexNow accepted ${chunk.length} URLs (HTTP ${result.status}).`);
      continue;
    }
    return {
      accepted,
      chunks,
      stop: {
        reason: result.status === 429 ? 'rate-limited' : 'failed',
        status: result.status,
        detail,
      },
    };
  }
  return { accepted, chunks, stop: null };
}

// ---------------------------------------------------------------------------------------------
// Live-site checks
// ---------------------------------------------------------------------------------------------

/** IndexNow verifies ownership by fetching this file, so it has to be live before submitting. */
export async function verifyKeyFile(
  config: IndexNowConfig,
  fetch: FetchLike = fetchWithProxy
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const url = keyLocation(config);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return { ok: false, detail: `GET ${url} returned HTTP ${response.status}` };
    const body = (await response.text()).trim();
    return body === config.key
      ? { ok: true }
      : { ok: false, detail: `${url} does not contain the configured key` };
  } catch (error) {
    return { ok: false, detail: `GET ${url} failed: ${errorMessage(error)}` };
  }
}

/** The What's new page of a release: aspire-13-6 for 13.6, aspire-14 for 14.0. */
export function whatsNewPath(version: string): string {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`"${version}" is not a release version such as 13.6`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return minor === 0 ? `/whats-new/aspire-${major}/` : `/whats-new/aspire-${major}-${minor}/`;
}

export async function isReleaseLive(
  host: string,
  version: string,
  fetch: FetchLike = fetchWithProxy
): Promise<boolean> {
  try {
    const response = await fetch(`https://${host}${whatsNewPath(version)}`, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface WaitForReleaseOptions {
  host: string;
  version: string;
  fetch?: FetchLike;
  sleep?: Sleep;
  now?: () => number;
  timeoutMs?: number;
  intervalMs?: number;
  log?: Logger;
}

/**
 * Waits for the release's What's new page to be served. The release merge normally lands right
 * after the slot swap; this protects against submitting URLs while the old build is still live,
 * which would make engines crawl stale content.
 */
export async function waitForRelease(options: WaitForReleaseOptions): Promise<boolean> {
  const {
    host,
    version,
    fetch = fetchWithProxy,
    sleep = defaultSleep,
    now = Date.now,
    timeoutMs = GATE_TIMEOUT_MS,
    intervalMs = GATE_INTERVAL_MS,
    log = consoleLogger,
  } = options;
  const deadline = now() + timeoutMs;
  for (;;) {
    if (await isReleaseLive(host, version, fetch)) return true;
    if (now() + intervalMs > deadline) return false;
    log.info(`Release ${version} is not live yet; checking again in ${intervalMs / 1000}s.`);
    await sleep(intervalMs);
  }
}

/** Reads the deployment identity the site embeds in every page. Diagnostic only. */
export async function readDeployment(
  host: string,
  fetch: FetchLike = fetchWithProxy
): Promise<string> {
  try {
    const response = await fetch(`https://${host}/`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return '';
    const match = /<meta\s+name="git-commit-id"\s+content="([^"]*)"/.exec(await response.text());
    return match?.[1].trim() ?? '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------------------------

/**
 * Recognizes a merged release PR: same-repository, merged, from `release/X.Y` (the branch the
 * release content is prepared on) or titled "Merge release/X.Y into main". Release PRs are
 * squash-merged, so Git ancestry cannot be used for this.
 */
export function detectReleaseMerge(event: unknown): { version: string; reason: string } | null {
  if (!isRecord(event) || !isRecord(event.pull_request)) return null;
  const pr = event.pull_request;
  if (pr.merged !== true) return null;

  const repo = (side: unknown) =>
    isRecord(side) && isRecord(side.repo) && typeof side.repo.full_name === 'string'
      ? side.repo.full_name
      : '';
  const headRepo = repo(pr.head);
  if (!headRepo || headRepo !== repo(pr.base)) return null;

  const headRef = isRecord(pr.head) && typeof pr.head.ref === 'string' ? pr.head.ref : '';
  const title = typeof pr.title === 'string' ? pr.title : '';
  const match =
    /^release\/(\d+\.\d+)$/.exec(headRef) ?? /^Merge release\/(\d+\.\d+) into main\b/i.exec(title);
  return match ? { version: match[1], reason: `release/${match[1]}` } : null;
}

export interface CliOptions {
  stateDir: string;
  mode: RunMode;
  limit?: number;
  release?: string;
  trigger: string;
  dryRun: boolean;
  allowShrink: boolean;
}

export function parseCli(argv: readonly string[]): CliOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      'state-dir': { type: 'string' },
      mode: { type: 'string' },
      limit: { type: 'string' },
      release: { type: 'string' },
      trigger: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'allow-shrink': { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });

  const stateDir = values['state-dir'];
  if (!stateDir) throw new Error('--state-dir is required');
  const mode = values.mode ?? 'daily';
  if (mode !== 'daily' && mode !== 'flush') throw new Error('--mode must be "daily" or "flush"');

  let limit: number | undefined;
  if (values.limit !== undefined) {
    limit = Number(values.limit);
    if (!isLimit(limit)) throw new Error(`--limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  if (values.release !== undefined && !/^\d+\.\d+$/.test(values.release)) {
    throw new Error('--release must look like 13.6');
  }

  return {
    stateDir: path.resolve(stateDir),
    mode,
    limit,
    release: values.release,
    trigger: values.trigger || 'manual',
    dryRun: values['dry-run'] ?? false,
    allowShrink: values['allow-shrink'] ?? false,
  };
}

export interface ResolvedRun {
  /** Set when the trigger does not call for a run; nothing is fetched or submitted. */
  skip?: string;
  mode: RunMode;
  release?: string;
  reason: string;
}

/** Turns the CLI options and the (pull_request) event payload into what this run should do. */
export function resolveRun(options: CliOptions, event: unknown): ResolvedRun {
  if (options.trigger === 'pull_request') {
    const release = detectReleaseMerge(event);
    if (!release) {
      return {
        skip: 'This pull request is not a merged release/X.Y pull request; nothing to submit.',
        mode: 'flush',
        reason: '',
      };
    }
    return { mode: 'flush', release: release.version, reason: release.reason };
  }

  let reason = 'manual';
  if (options.release) reason = `release/${options.release}`;
  else if (options.mode === 'flush') reason = 'manual flush';
  else if (options.trigger === 'schedule') reason = 'schedule';
  return { mode: options.mode, release: options.release, reason };
}

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

export interface RunReport {
  outcome: 'completed' | 'dry-run' | 'skipped' | 'rate-limited' | 'failed';
  trigger: string;
  mode: RunMode;
  reason: string;
  host: string;
  note: string;
  deployment: string;
  coldStart: boolean;
  budget: number;
  totalUrls: number;
  newUrls: number;
  removedUrls: number;
  /** URLs planned (dry run) or accepted (real run) from the rotation window. */
  windowUrls: number;
  submitted: number;
  /** New and removed URLs that did not fit in this run and stay pending. */
  deferred: number;
  cycleKind: CycleKind | null;
  cycleCovered: number;
  cycleCompleted: boolean;
  chunks: ChunkResult[];
  firstWindowUrl: string;
  lastWindowUrl: string;
}

export interface RunResult {
  report: RunReport;
  stateChanged: boolean;
  /** Set when the run failed after it had started submitting. */
  failure?: string;
}

export interface RunOptions {
  config: IndexNowConfig;
  stateDir: string;
  mode: RunMode;
  trigger: string;
  reason: string;
  dryRun?: boolean;
  allowShrink?: boolean;
  limit?: number;
  /** Wait for this release's What's new page before submitting. */
  release?: string;
  fetch?: FetchLike;
  sleep?: Sleep;
  now?: () => Date;
  log?: Logger;
  gate?: { timeoutMs?: number; intervalMs?: number };
}

export function emptyReport(
  overrides: Partial<RunReport> & Pick<RunReport, 'outcome' | 'trigger' | 'host'>
): RunReport {
  return {
    mode: 'daily',
    reason: '',
    note: '',
    deployment: '',
    coldStart: false,
    budget: 0,
    totalUrls: 0,
    newUrls: 0,
    removedUrls: 0,
    windowUrls: 0,
    submitted: 0,
    deferred: 0,
    cycleKind: null,
    cycleCovered: 0,
    cycleCompleted: false,
    chunks: [],
    firstWindowUrl: '',
    lastWindowUrl: '',
    ...overrides,
  };
}

export async function run(options: RunOptions): Promise<RunResult> {
  const { config, stateDir, mode, trigger, reason, release, limit } = options;
  const dryRun = options.dryRun ?? false;
  const fetch = options.fetch ?? fetchWithProxy;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? consoleLogger;
  const base = { trigger, mode, reason, host: config.host };

  const state = await loadState(stateDir, config.host, log);
  log.info(
    state
      ? `Loaded state from ${state.updatedAt}: ${state.known.length} known URLs.`
      : 'No previous state; this is a cold start.'
  );

  const key = await verifyKeyFile(config, fetch);
  if (!key.ok) {
    if (dryRun) {
      log.warn(`${key.detail}. IndexNow would reject submissions until the key file is live.`);
    } else if (state === null) {
      // Before the first deployment that ships the key file there is nothing to submit yet.
      const note = `The IndexNow key file is not live yet (${key.detail}); skipping this run.`;
      log.warn(note);
      return { report: emptyReport({ ...base, outcome: 'skipped', note }), stateChanged: false };
    } else {
      throw new Error(`The IndexNow key file is not reachable: ${key.detail}`);
    }
  }

  if (release) {
    if (dryRun) {
      if (!(await isReleaseLive(config.host, release, fetch))) {
        log.warn(`The What's new page for release ${release} is not live yet.`);
      }
    } else {
      const ready = await waitForRelease({
        host: config.host,
        version: release,
        fetch,
        sleep,
        now: () => now().getTime(),
        log,
        ...options.gate,
      });
      if (!ready) {
        throw new Error(
          `The What's new page for release ${release} (${whatsNewPath(release)}) did not go live in ` +
            'time. Run the workflow again with the release input once the new docs are live.'
        );
      }
    }
  }

  const { urls, rejected } = normalizeUrls(
    await fetchSitemapLocations(config.sitemapIndex, fetch),
    config.host
  );
  if (rejected.length > 0) {
    log.warn(
      `Ignored ${rejected.length} sitemap URLs that are not https URLs on ${config.host} (for example ${rejected[0]}).`
    );
  }
  const deployment = await readDeployment(config.host, fetch);

  const plan = planRun({
    current: urls,
    state,
    mode,
    reason,
    budgets: config.budgets,
    limit,
    now: now(),
    allowShrink: options.allowShrink,
  });
  const ordered = [...plan.removed, ...plan.fresh, ...plan.window];
  const planned = {
    ...base,
    deployment,
    coldStart: plan.coldStart,
    budget: plan.budget,
    totalUrls: plan.total,
    newUrls: plan.newUrls.length,
    removedUrls: plan.removedUrls.length,
    deferred:
      plan.newUrls.length + plan.removedUrls.length - plan.removed.length - plan.fresh.length,
    cycleKind: plan.cycle.kind,
    firstWindowUrl: plan.window[0] ?? '',
    lastWindowUrl: plan.window[plan.window.length - 1] ?? '',
  };
  log.info(
    `Sitemap: ${plan.total} URLs; ${plan.newUrls.length} new, ${plan.removedUrls.length} removed. ` +
      `Submitting ${ordered.length} (${plan.removed.length} removed, ${plan.fresh.length} new, ` +
      `${plan.window.length} from the ${plan.cycle.kind} cycle) with a budget of ${plan.budget}.`
  );

  if (dryRun) {
    return {
      report: emptyReport({
        ...planned,
        outcome: 'dry-run',
        note: 'Dry run: nothing was submitted and the state was not saved.',
        windowUrls: plan.window.length,
        submitted: ordered.length,
        cycleCovered: plan.covered,
        cycleCompleted: plan.windowComplete,
      }),
      stateChanged: false,
    };
  }

  const result: SubmitResult =
    ordered.length === 0
      ? { accepted: 0, chunks: [], stop: null }
      : await submitUrls({ config, urls: ordered, fetch, sleep, now: () => now().getTime(), log });

  // Progress is kept even when a later chunk fails, so accepted URLs are never sent twice.
  const stateChanged = result.stop === null || result.accepted > 0 || plan.coldStart;
  let next: IndexNowState | null = null;
  if (stateChanged) {
    next = finalizeRun(plan, {
      host: config.host,
      current: urls,
      accepted: result.accepted,
      now: now(),
      trigger,
      deployment,
      statuses: result.chunks.map((chunk) => chunk.status),
    });
    await saveState(stateDir, next);
  }

  const cycleCompleted = next !== null && next.cycle === null;
  const cursor = next ? (next.cycle?.cursor ?? null) : plan.cycle.cursor;
  const report = emptyReport({
    ...planned,
    outcome: 'completed',
    windowUrls: next?.lastRun?.windowUrls ?? 0,
    submitted: result.accepted,
    chunks: result.chunks,
    cycleCovered: cycleCompleted ? plan.total : countCovered(urls, cursor, plan.localeCodes),
    cycleCompleted,
  });

  if (result.stop?.reason === 'rate-limited') {
    const note =
      `IndexNow answered 429 (too many requests) after ${result.accepted} URLs. The progress was ` +
      'saved and the next run continues from there.';
    log.warn(note);
    return { report: { ...report, outcome: 'rate-limited', note }, stateChanged };
  }
  if (result.stop) {
    const failure =
      `IndexNow rejected the submission with HTTP ${result.stop.status || 'a network error'}` +
      `${result.stop.detail ? `: ${result.stop.detail}` : ''}. ` +
      'For 403 or 422, check that the key file is live and matches config/indexnow.json.';
    return { report: { ...report, outcome: 'failed', note: failure }, stateChanged, failure };
  }
  return { report, stateChanged };
}

export function renderSummary(report: RunReport): string {
  const count = (value: number) => value.toLocaleString('en-US');
  const code = (value: string) => `\`${value}\``;
  const rows: [string, string][] = [
    ['Outcome', report.outcome],
    ['Trigger', code(report.trigger)],
  ];
  if (report.outcome !== 'skipped') {
    rows.push(['Mode', `${code(report.mode)}${report.reason ? ` (${report.reason})` : ''}`]);
  }
  if (report.totalUrls > 0) {
    rows.push(
      ['Sitemap URLs', count(report.totalUrls)],
      ['New / removed', `${count(report.newUrls)} / ${count(report.removedUrls)}`]
    );
    if (report.deferred > 0) rows.push(['Deferred to the next run', count(report.deferred)]);
    rows.push([
      report.outcome === 'dry-run' ? 'Would submit' : 'Submitted',
      `${count(report.submitted)} of a ${count(report.budget)} URL budget`,
    ]);
    if (report.cycleKind) {
      const percent = Math.floor((report.cycleCovered / report.totalUrls) * 100);
      rows.push([
        'Cycle',
        `${report.cycleKind}: ${count(report.cycleCovered)} of ${count(report.totalUrls)} URLs ` +
          `(${percent}%)${report.cycleCompleted ? ', complete' : ''}`,
      ]);
    }
    if (report.firstWindowUrl) {
      rows.push([
        'Window',
        `${count(report.windowUrls)} URLs, ${code(report.firstWindowUrl)} to ${code(report.lastWindowUrl)}`,
      ]);
    }
  }
  if (report.chunks.length > 0) {
    rows.push([
      'Requests',
      report.chunks
        .map((chunk) => `HTTP ${chunk.status || 'error'} for ${count(chunk.size)} URLs`)
        .join('<br>'),
    ]);
  }
  if (report.deployment) rows.push(['Live deployment', code(report.deployment.slice(0, 7))]);
  if (report.coldStart) {
    rows.push([
      'Cold start',
      `yes: the known URL list ${report.outcome === 'dry-run' ? 'would be' : 'was'} seeded`,
    ]);
  }

  const lines = [
    `## IndexNow submission${report.host ? ` for ${report.host}` : ''}`,
    '',
    '| | |',
    '|---|---|',
    ...rows.map(([name, value]) => `| ${name} | ${value} |`),
  ];
  if (report.note) lines.push('', report.note);
  return `${lines.join('\n')}\n`;
}

async function readEventPayload(env: NodeJS.ProcessEnv): Promise<unknown> {
  if (!env.GITHUB_EVENT_PATH) throw new Error('GITHUB_EVENT_PATH is not set');
  const payload: unknown = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  return payload;
}

async function publish(
  env: NodeJS.ProcessEnv,
  report: RunReport,
  stateChanged: boolean
): Promise<void> {
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, renderSummary(report));
  if (env.GITHUB_OUTPUT) {
    await appendFile(
      env.GITHUB_OUTPUT,
      `state_changed=${stateChanged}\nsubmitted=${report.submitted}\noutcome=${report.outcome}\n`
    );
  }
}

/** Runs the CLI and returns the process exit code. */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  log: Logger = consoleLogger,
  overrides: Pick<RunOptions, 'fetch' | 'sleep' | 'now' | 'gate'> = {}
): Promise<number> {
  let trigger = 'manual';
  let host = '';
  try {
    const options = parseCli(argv);
    trigger = options.trigger;
    const config = await loadConfig();
    host = config.host;
    const event = trigger === 'pull_request' ? await readEventPayload(env) : undefined;
    const resolved = resolveRun(options, event);

    if (resolved.skip) {
      log.info(resolved.skip);
      await publish(
        env,
        emptyReport({ outcome: 'skipped', trigger, host, note: resolved.skip }),
        false
      );
      return 0;
    }

    const result = await run({
      config,
      stateDir: options.stateDir,
      mode: resolved.mode,
      trigger,
      reason: resolved.reason,
      release: resolved.release,
      limit: options.limit,
      dryRun: options.dryRun,
      allowShrink: options.allowShrink,
      log,
      ...overrides,
    });
    await publish(env, result.report, result.stateChanged);
    if (result.failure) {
      log.error(result.failure);
      return 1;
    }
    return 0;
  } catch (error) {
    const message = errorMessage(error);
    log.error(message);
    await publish(
      env,
      emptyReport({ outcome: 'failed', trigger, host, note: message }),
      false
    ).catch(() => undefined);
    return 1;
  }
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
