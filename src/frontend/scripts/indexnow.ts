/**
 * Tells IndexNow-participating search engines (Bing, Yandex, Naver, Seznam, Yep, Amazon) about
 * aspire.dev URLs. See https://www.indexnow.org/documentation.
 *
 * Every run reads the live sitemap, compares it with the URL list saved by the previous run and
 * sends one request (IndexNow takes at most 10,000 URLs in one) with, in this order:
 *   1. URLs that left the sitemap (so engines drop them) and URLs that are new in it,
 *   2. the next window of a rotation that walks the whole sitemap: English pages first, then the
 *      API reference, then localized pages.
 *
 * The rotation is a cursor over that order, so it survives pages being added or removed. A release
 * is a "flush": it starts the rotation again from the top at the larger release budget, and the
 * daily runs finish that pass before the small rotation budget applies again. IndexNow does not
 * publish its rate limits, so both budgets are in config/indexnow.json. A request that fails (a
 * 429 included) leaves the progress alone, so the next run simply tries again; only a cold start
 * still seeds the known list and a flush still starts its pass. A page that is new while a pass
 * is running can be sent twice: when it appears and when the rotation reaches it.
 *
 * The sitemap has no `lastmod`, so the script cannot tell an updated page from an unchanged one.
 * A release flush sends the English pages first, which is where the new and updated docs are, and
 * the generated API reference after them.
 *
 * Besides config/indexnow.json, the script assumes that:
 *   - pages under /reference/api/ are the generated API reference, and the locale folders listed
 *     in config/locales.ts hold the translations; both are sent after the English pages,
 *   - release X.Y is merged from a release/X.Y branch and publishes /whats-new/aspire-X-Y/ (or
 *     aspire-X for X.0), which is how a run knows that the new docs are live.
 *
 * The state (state.json) lives in --state-dir. The workflow keeps it between runs as an Actions
 * artifact; losing it only causes a cold start, which seeds the known URL list without submitting
 * every URL as new.
 *
 * Usage (from src/frontend):
 *   pnpm indexnow --state-dir <dir> [--mode daily|flush] [--limit <n>] [--release <X.Y>]
 *                 [--trigger <name>] [--dry-run] [--allow-shrink]
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { locales } from '../config/locales';
import { fetchWithProxy } from './fetch-with-proxy';

export type FetchLike = typeof fetchWithProxy;
export type RunMode = 'daily' | 'flush';

export interface IndexNowConfig {
  host: string;
  key: string;
  endpoint: string;
  sitemapIndex: string;
  budgets: { release: number; rotation: number };
}

/** A pass over the sitemap. `cursor` is the last URL covered, in the order of `compareUrls`. */
export interface Cycle {
  kind: 'release' | 'rotation';
  cursor: string | null;
}

export interface IndexNowState {
  host: string;
  updatedAt: string;
  /** The pass in progress, or null when the last one finished and the next run starts a new one. */
  cycle: Cycle | null;
  /** The sitemap URLs that were submitted or are left to the pass in progress. */
  known: string[];
}

/** What a run needs from the outside world. Tests replace it. */
export interface Deps {
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
}

const CONFIG_PATH = fileURLToPath(new URL('../config/indexnow.json', import.meta.url));
const STATE_FILE = 'state.json';
const SCHEMA_VERSION = 1;
const USER_AGENT = 'aspire.dev-indexnow (+https://github.com/microsoft/aspire.dev)';
/** The generated API reference, which is sent after the English pages. */
const API_REFERENCE_PATH = '/reference/api/';

/** IndexNow takes at most 10,000 URLs per request, and a run sends a single request. */
export const MAX_URLS_PER_RUN = 10_000;
/** A sitemap with fewer URLs than this share of the last known list is treated as broken. */
export const SHRINK_THRESHOLD = 0.8;
/** Waits before the retries of a request that failed with a 5xx or a network error. */
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];
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

function annotate(level: 'warning' | 'error', message: string): string {
  return process.env.GITHUB_ACTIONS === 'true'
    ? `::${level}::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`
    : `${level}: ${message}`;
}

const log = {
  info: (message: string) => console.log(message),
  warn: (message: string) => console.warn(annotate('warning', message)),
  error: (message: string) => console.error(annotate('error', message)),
};

export async function loadConfig(configPath = CONFIG_PATH): Promise<IndexNowConfig> {
  return JSON.parse(await readFile(configPath, 'utf8')) as IndexNowConfig;
}

export function keyLocation(config: Pick<IndexNowConfig, 'host' | 'key'>): string {
  return `https://${config.host}/${config.key}.txt`;
}

// ---------------------------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------------------------

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * Reads the `<loc>` values of a sitemap or sitemap index. The `xhtml:link` alternates that Astro
 * adds carry their URL in an attribute and are ignored: every localized page is also listed as a
 * `<url>` of its own.
 */
export function parseSitemap(xml: string): { kind: 'index' | 'urlset'; locations: string[] } {
  const root = /<(sitemapindex|urlset)[\s>]/.exec(xml);
  if (!root) throw new Error('Not a sitemap: expected a <urlset> or <sitemapindex> element');
  const locations = [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((match) =>
    match[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => XML_ENTITIES[name])
  );
  return { kind: root[1] === 'sitemapindex' ? 'index' : 'urlset', locations };
}

/** The https URL on `host` without a fragment, or null for anything else. */
function canonicalUrl(value: string, host: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== host) return null;
    if (url.port || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

/** Every page URL of the sitemap (following a sitemap index one level deep), de-duplicated. */
export async function fetchSitemapUrls(
  indexUrl: string,
  host: string,
  fetch: FetchLike
): Promise<string[]> {
  const load = async (url: string) => {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
    return parseSitemap(await response.text());
  };

  const root = await load(indexUrl);
  let locations = root.locations;
  if (root.kind === 'index') {
    locations = [];
    for (const child of root.locations) {
      if (canonicalUrl(child, host) === null) {
        throw new Error(`Refusing to read sitemap ${child}: it is not an https URL on ${host}`);
      }
      const sitemap = await load(child);
      if (sitemap.kind !== 'urlset') throw new Error(`${child} is a nested sitemap index`);
      for (const location of sitemap.locations) locations.push(location);
    }
  }

  const urls = new Set<string>();
  let ignored = 0;
  for (const location of locations) {
    const url = canonicalUrl(location, host);
    if (url) urls.add(url);
    else ignored++;
  }
  if (ignored > 0) log.warn(`Ignored ${ignored} sitemap URLs that are not https URLs on ${host}.`);
  return [...urls];
}

// ---------------------------------------------------------------------------------------------
// Ordering and planning
// ---------------------------------------------------------------------------------------------

/**
 * Priority of a page. Lower tiers are sent first: English pages (docs, integrations, What's new),
 * then the API reference, then localized pages.
 */
export function tierOf(pathname: string): 0 | 1 | 2 {
  if (LOCALE_CODES.has(pathname.split('/')[1] ?? '')) return 2;
  return pathname.startsWith(API_REFERENCE_PATH) ? 1 : 0;
}

interface Entry {
  url: string;
  tier: number;
}

const toEntry = (url: string): Entry => ({ url, tier: tierOf(new URL(url).pathname) });

function compareEntries(a: Entry, b: Entry): number {
  return a.tier - b.tier || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
}

/** Orders URLs by (tier, URL), the order the rotation cursor walks. */
export function compareUrls(a: string, b: string): number {
  return compareEntries(toEntry(a), toEntry(b));
}

export interface PlanInput {
  /** Normalized, de-duplicated sitemap URLs. */
  current: readonly string[];
  state: IndexNowState | null;
  mode: RunMode;
  budgets: IndexNowConfig['budgets'];
  /** Replaces the budget for this run. It is a hard cap: it bounds the removed and new URLs too. */
  limit?: number;
  allowShrink?: boolean;
}

export interface Plan {
  coldStart: boolean;
  mode: RunMode;
  budget: number;
  /** The pass this run works on (continued or newly started). */
  cycle: Cycle;
  total: number;
  /** Every URL that is in the sitemap but was not known. */
  newUrls: string[];
  /** Every known URL that left the sitemap. */
  removedUrls: string[];
  /** The removed URLs sent this run. */
  removed: string[];
  /** The new URLs sent ahead of the window. A flush leaves them to its window. */
  fresh: string[];
  /** The next URLs of the rotation. */
  window: string[];
  /** True when sending the window finishes the pass. */
  windowComplete: boolean;
  /** How many sitemap URLs the pass has covered once the window is sent. */
  covered: number;
}

/**
 * Decides what to send. Pure: it does not touch the network or the disk.
 *
 * - A cold start (no state) seeds the known list and never treats the whole sitemap as new.
 * - A flush starts a release pass from the top; otherwise the pass in progress continues, or a new
 *   rotation pass begins when the previous one has finished.
 * - Removed and new URLs go first and count against the budget. A flush is the exception for new
 *   URLs: its pass covers the whole sitemap, so it leaves them to the window.
 */
export function planRun(input: PlanInput): Plan {
  const { state, mode } = input;
  const currentSet = new Set(input.current);
  const total = currentSet.size;
  if (total === 0) throw new Error('The sitemap lists no URLs; refusing to continue');

  const previous = state?.known ?? [];
  if (state && !input.allowShrink && total < previous.length * SHRINK_THRESHOLD) {
    throw new Error(
      `The sitemap lists ${total} URLs, more than ${Math.round((1 - SHRINK_THRESHOLD) * 100)}% ` +
        `fewer than the ${previous.length} known from the last run. Refusing to continue in case ` +
        'the site was only partially deployed; rerun with --allow-shrink if the drop is intended.'
    );
  }

  const entries = [...currentSet].map(toEntry).sort(compareEntries);
  const knownSet = new Set(previous);
  const newUrls = state ? entries.filter((e) => !knownSet.has(e.url)).map((e) => e.url) : [];
  const removedUrls = previous
    .filter((url) => !currentSet.has(url))
    .map(toEntry)
    .sort(compareEntries)
    .map((entry) => entry.url);

  const cycle: Cycle =
    mode === 'flush'
      ? { kind: 'release', cursor: null }
      : (state?.cycle ?? { kind: 'rotation', cursor: null });
  const configured = cycle.kind === 'release' ? input.budgets.release : input.budgets.rotation;
  const budget = Math.min(input.limit ?? configured, MAX_URLS_PER_RUN);

  const cap = Math.min(input.limit ?? MAX_URLS_PER_RUN, MAX_URLS_PER_RUN);
  const removed = removedUrls.slice(0, cap);
  const fresh = (mode === 'flush' ? [] : newUrls).slice(0, cap - removed.length);
  const room = Math.max(0, budget - removed.length - fresh.length);

  let start = 0;
  if (cycle.cursor !== null) {
    const target = toEntry(cycle.cursor);
    start = entries.findIndex((entry) => compareEntries(entry, target) > 0);
    if (start === -1) start = entries.length;
  }
  const window = entries.slice(start, start + room).map((entry) => entry.url);

  return {
    coldStart: state === null,
    mode,
    budget,
    cycle,
    total,
    newUrls,
    removedUrls,
    removed,
    fresh,
    window,
    windowComplete: start + window.length >= total,
    covered: start + window.length,
  };
}

export interface FinalizeOptions {
  host: string;
  /** The URLs the plan was computed from. */
  current: readonly string[];
  /** Whether IndexNow accepted the request. */
  submitted: boolean;
  now: Date;
}

/**
 * Builds the state to remember after a run. URLs count as done only when the request was
 * accepted: a new URL that was not sent stays new, a removed URL that was not sent stays known, and
 * the cursor moves to the last URL of the window. The new URLs of a flush count as known right
 * away, because the pass it starts reaches them.
 */
export function finalizeRun(plan: Plan, options: FinalizeOptions): IndexNowState {
  const { host, current, submitted, now } = options;
  const sent = new Set(submitted ? [...plan.removed, ...plan.fresh, ...plan.window] : []);
  const known = new Set(current);
  if (plan.mode !== 'flush') {
    for (const url of plan.newUrls) if (!sent.has(url)) known.delete(url);
  }
  for (const url of plan.removedUrls) if (!sent.has(url)) known.add(url);

  const cursor = submitted ? (plan.window.at(-1) ?? plan.cycle.cursor) : plan.cycle.cursor;
  return {
    host,
    updatedAt: now.toISOString(),
    cycle: submitted && plan.windowComplete ? null : { ...plan.cycle, cursor },
    known: [...known].sort(),
  };
}

// ---------------------------------------------------------------------------------------------
// State on disk
// ---------------------------------------------------------------------------------------------

function isCycle(value: unknown): value is Cycle | null {
  return (
    value === null ||
    (isRecord(value) &&
      (value.kind === 'release' || value.kind === 'rotation') &&
      (value.cursor === null || typeof value.cursor === 'string'))
  );
}

/** Returns null for a missing state (a cold start) and for one that cannot be trusted. */
export async function loadState(dir: string, host: string): Promise<IndexNowState | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(dir, STATE_FILE), 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return null;
    throw error;
  }

  try {
    const file: unknown = JSON.parse(raw);
    if (!isRecord(file) || file.schemaVersion !== SCHEMA_VERSION || file.host !== host) {
      throw new Error('it was written for another schema version or host');
    }
    const { updatedAt, cycle, known } = file;
    // The state comes from an artifact, so anything that is not a page of this site is not trusted.
    if (
      typeof updatedAt !== 'string' ||
      !isCycle(cycle) ||
      !Array.isArray(known) ||
      known.length === 0 ||
      !known.every((url) => typeof url === 'string' && canonicalUrl(url, host) === url) ||
      (typeof cycle?.cursor === 'string' && canonicalUrl(cycle.cursor, host) !== cycle.cursor)
    ) {
      throw new Error('it is not in the expected format');
    }
    return { host, updatedAt, cycle, known: known as string[] };
  } catch (error) {
    log.warn(`Ignoring unusable IndexNow state (${errorMessage(error)}); starting cold.`);
    return null;
  }
}

export async function saveState(dir: string, state: IndexNowState): Promise<void> {
  await mkdir(dir, { recursive: true });
  const content = JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...state }, null, 2);
  await writeFile(path.join(dir, STATE_FILE), `${content}\n`, 'utf8');
}

// ---------------------------------------------------------------------------------------------
// Talking to IndexNow and the site
// ---------------------------------------------------------------------------------------------

export type Submission = { ok: true } | { ok: false; status: number; detail: string };

/**
 * Sends the URLs in a single request. A 5xx or a network error is retried after a back-off; any
 * other answer, a 429 included, ends the attempt, and the next run tries again.
 */
export async function submitUrls(
  config: IndexNowConfig,
  urls: readonly string[],
  deps: Pick<Deps, 'fetch' | 'sleep'>
): Promise<Submission> {
  const body = JSON.stringify({
    host: config.host,
    key: config.key,
    keyLocation: keyLocation(config),
    urlList: urls,
  });

  let status = 0;
  let detail = '';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1];
      log.warn(
        `IndexNow answered ${status || 'with a network error'}; retrying in ${delay / 1000}s.`
      );
      await deps.sleep(delay);
    }
    try {
      const response = await deps.fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': USER_AGENT },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      status = response.status;
      detail = (await response.text()).trim().slice(0, 300);
    } catch (error) {
      status = 0;
      detail = errorMessage(error);
    }
    // 202 is what IndexNow answers while it is still verifying a new key.
    if (status === 200 || status === 202) return { ok: true };
    if (status !== 0 && status < 500) break;
  }
  return { ok: false, status, detail };
}

/** IndexNow verifies ownership by fetching the key file, so it has to be live before submitting. */
export async function keyFileProblem(
  config: IndexNowConfig,
  fetch: FetchLike
): Promise<string | null> {
  const url = keyLocation(config);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return `GET ${url} returned HTTP ${response.status}`;
    return (await response.text()).trim() === config.key
      ? null
      : `${url} does not contain the configured key`;
  } catch (error) {
    return `GET ${url} failed: ${errorMessage(error)}`;
  }
}

/** The What's new page of a release: aspire-13-6 for 13.6, aspire-14 for 14.0. */
export function whatsNewPath(version: string): string {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`"${version}" is not a release version such as 13.6`);
  const [major, minor] = [Number(match[1]), Number(match[2])];
  return minor === 0 ? `/whats-new/aspire-${major}/` : `/whats-new/aspire-${major}-${minor}/`;
}

/**
 * Waits for the release's What's new page to be served. The release merge normally lands right
 * after the slot swap; this protects against sending URLs while the old build is still live, which
 * would make engines crawl stale content.
 */
export async function waitForRelease(
  host: string,
  version: string,
  deps: Deps,
  { timeoutMs = GATE_TIMEOUT_MS, intervalMs = GATE_INTERVAL_MS } = {}
): Promise<boolean> {
  const url = `https://${host}${whatsNewPath(version)}`;
  const deadline = deps.now().getTime() + timeoutMs;
  for (;;) {
    try {
      const response = await deps.fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return true;
    } catch {
      // Not reachable yet counts as not live.
    }
    if (deps.now().getTime() + intervalMs > deadline) return false;
    log.info(`Release ${version} is not live yet; checking again in ${intervalMs / 1000}s.`);
    await deps.sleep(intervalMs);
  }
}

/**
 * The version of a merged release pull request: from this repository, merged, from a
 * `release/X.Y` branch. Release pull requests are squash-merged, so Git ancestry cannot be used.
 */
export function releaseVersion(event: unknown): string | null {
  const pull = isRecord(event) ? event.pull_request : undefined;
  if (!isRecord(pull) || pull.merged !== true) return null;
  const repository = (side: unknown) =>
    isRecord(side) && isRecord(side.repo) ? side.repo.full_name : undefined;
  const ref = isRecord(pull.head) ? pull.head.ref : undefined;
  if (typeof ref !== 'string' || typeof repository(pull.head) !== 'string') return null;
  if (repository(pull.head) !== repository(pull.base)) return null;
  return /^release\/(\d+\.\d+)$/.exec(ref)?.[1] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

export interface RunOptions extends Partial<Deps> {
  config: IndexNowConfig;
  stateDir: string;
  mode: RunMode;
  trigger: string;
  /** Wait for this release's What's new page before submitting. */
  release?: string;
  limit?: number;
  dryRun?: boolean;
  allowShrink?: boolean;
}

export interface RunResult {
  outcome: 'completed' | 'dry-run' | 'skipped' | 'failed';
  /** URLs accepted by IndexNow, or planned in a dry run. */
  submitted: number;
  stateChanged: boolean;
  /** Markdown for the job summary page. */
  summary: string;
  /** Set when the run failed after it had started submitting. */
  failure?: string;
}

const count = (value: number) => value.toLocaleString('en-US');

function summarize(host: string, outcome: RunResult['outcome'], lines: (string | false)[]): string {
  const bullets = lines.filter(Boolean).map((line) => `- ${line}`);
  return [`## IndexNow submission for ${host}: ${outcome}`, '', ...bullets, ''].join('\n');
}

function skipped(host: string, note: string): RunResult {
  const summary = summarize(host, 'skipped', [note]);
  return { outcome: 'skipped', submitted: 0, stateChanged: false, summary };
}

function failureMessage(submission: { status: number; detail: string }, mode: RunMode): string {
  const reason =
    submission.status === 429
      ? 'IndexNow answered 429 (too many requests), so nothing was submitted. If this keeps happening, lower the budgets in config/indexnow.json.'
      : `IndexNow rejected the submission with HTTP ${submission.status || 'a network error'}` +
        `${submission.detail ? `: ${submission.detail}` : ''}. ` +
        'For 403 or 422, check that the key file is live and matches config/indexnow.json.';
  return mode === 'flush'
    ? `${reason} The release pass was started, so the next run sends it from the top.`
    : `${reason} The next run tries again.`;
}

export async function run(options: RunOptions): Promise<RunResult> {
  const { config, stateDir, mode, trigger, release, dryRun = false } = options;
  const { host } = config;
  const deps: Deps = {
    fetch: options.fetch ?? fetchWithProxy,
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    now: options.now ?? (() => new Date()),
  };

  const state = await loadState(stateDir, host);
  log.info(
    state
      ? `Loaded state from ${state.updatedAt}: ${state.known.length} known URLs.`
      : 'No previous state; this is a cold start.'
  );

  const keyProblem = await keyFileProblem(config, deps.fetch);
  if (keyProblem) {
    if (dryRun) {
      log.warn(`${keyProblem}. IndexNow would reject submissions until the key file is live.`);
    } else if (state === null) {
      // Before the first deployment that ships the key file there is nothing to submit yet.
      const note = `The IndexNow key file is not live yet (${keyProblem}); skipping this run.`;
      log.warn(note);
      return skipped(host, note);
    } else {
      throw new Error(`The IndexNow key file is not reachable: ${keyProblem}`);
    }
  }

  if (release) {
    // A dry run only checks once.
    const gate = dryRun ? { timeoutMs: 0 } : undefined;
    if (!(await waitForRelease(host, release, deps, gate))) {
      if (!dryRun) {
        throw new Error(
          `The What's new page for release ${release} (${whatsNewPath(release)}) did not go live in ` +
            `time. Once the new docs are live, run the workflow manually with mode "flush" and release "${release}".`
        );
      }
      log.warn(`The What's new page for release ${release} is not live yet.`);
    }
  }

  const urls = await fetchSitemapUrls(config.sitemapIndex, host, deps.fetch);
  const plan = planRun({
    current: urls,
    state,
    mode,
    budgets: config.budgets,
    limit: options.limit,
    allowShrink: options.allowShrink,
  });
  const ordered = [...plan.removed, ...plan.fresh, ...plan.window];
  const facts = [
    `Sitemap: ${count(plan.total)} URLs, ${count(plan.newUrls.length)} new and ${count(plan.removedUrls.length)} removed since the last run`,
    `Plan: ${count(ordered.length)} URLs (${count(plan.removed.length)} removed, ${count(plan.fresh.length)} new, ${count(plan.window.length)} from the ${plan.cycle.kind} pass) with a budget of ${count(plan.budget)}`,
  ];
  for (const fact of facts) log.info(fact);
  const describe = (outcome: RunResult['outcome'], covered: number, finished: boolean, note = '') =>
    summarize(host, outcome, [
      `Trigger \`${trigger}\`, mode \`${mode}\`${release ? `, release ${release}` : ''}`,
      ...facts,
      `Pass: ${plan.cycle.kind}, ${count(covered)} of ${count(plan.total)} URLs covered (${Math.floor((covered / plan.total) * 100)}%)${finished ? ', complete' : ''}`,
      plan.coldStart && `Cold start: the known URL list ${dryRun ? 'would be' : 'was'} seeded`,
      note,
    ]);
  if (dryRun) {
    const note = 'Dry run: nothing was submitted and the state was not saved.';
    const summary = describe('dry-run', plan.covered, plan.windowComplete, note);
    return { outcome: 'dry-run', submitted: ordered.length, stateChanged: false, summary };
  }

  const submission: Submission =
    ordered.length === 0 ? { ok: true } : await submitUrls(config, ordered, deps);

  // A failed run leaves the state alone, except that a cold start still seeds the known list and a
  // flush still starts the release pass: dropping that would lose the burst, which the next run
  // then carries out.
  const stateChanged = submission.ok || plan.coldStart || plan.mode === 'flush';
  if (stateChanged) {
    const next = finalizeRun(plan, {
      host,
      current: urls,
      submitted: submission.ok,
      now: deps.now(),
    });
    await saveState(stateDir, next);
  }

  if (submission.ok) {
    const summary = describe('completed', plan.covered, plan.windowComplete);
    return { outcome: 'completed', submitted: ordered.length, stateChanged, summary };
  }
  const failure = failureMessage(submission, plan.mode);
  const summary = describe('failed', plan.covered - plan.window.length, false, failure);
  return { outcome: 'failed', submitted: 0, stateChanged, summary, failure };
}

// ---------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------

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

  if (!values['state-dir']) throw new Error('--state-dir is required');
  const mode = values.mode ?? 'daily';
  if (mode !== 'daily' && mode !== 'flush') throw new Error('--mode must be "daily" or "flush"');

  let limit: number | undefined;
  if (values.limit !== undefined) {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_URLS_PER_RUN) {
      throw new Error(`--limit must be an integer between 1 and ${MAX_URLS_PER_RUN}`);
    }
  }
  if (values.release !== undefined && !/^\d+\.\d+$/.test(values.release)) {
    throw new Error('--release must look like 13.6');
  }

  return {
    stateDir: path.resolve(values['state-dir']),
    mode,
    limit,
    release: values.release,
    trigger: values.trigger || 'manual',
    dryRun: values['dry-run'] ?? false,
    allowShrink: values['allow-shrink'] ?? false,
  };
}

/** Runs the CLI and returns the process exit code. */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Deps> = {}
): Promise<number> {
  let host = '';
  const publish = async (summary: string, stateChanged: boolean) => {
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary);
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `state_changed=${stateChanged}\n`);
  };

  try {
    const options = parseCli(argv);
    const config = await loadConfig();
    host = config.host;

    let { mode, release } = options;
    if (options.trigger === 'pull_request') {
      if (!env.GITHUB_EVENT_PATH) throw new Error('GITHUB_EVENT_PATH is not set');
      const event: unknown = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
      const version = releaseVersion(event);
      if (!version) {
        const note =
          'This pull request is not a merged release/X.Y pull request; nothing to submit.';
        log.info(note);
        await publish(skipped(host, note).summary, false);
        return 0;
      }
      [mode, release] = ['flush', version];
    }

    const result = await run({
      ...overrides,
      config,
      stateDir: options.stateDir,
      mode,
      trigger: options.trigger,
      release,
      limit: options.limit,
      dryRun: options.dryRun,
      allowShrink: options.allowShrink,
    });
    await publish(result.summary, result.stateChanged);
    if (result.failure) {
      log.error(result.failure);
      return 1;
    }
    return 0;
  } catch (error) {
    const message = errorMessage(error);
    log.error(message);
    await publish(summarize(host, 'failed', [message]), false).catch(() => undefined);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
