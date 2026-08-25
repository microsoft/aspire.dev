/**
 * Framework-free decision logic for announcement-banner auto-expiry.
 *
 * Kept DOM- and storage-free so it can be unit-tested in isolation **and so it
 * is the single source of truth**: the client controller in
 * `src/components/starlight/Banner.astro` imports these functions directly
 * (rather than re-implementing them), so the shipped behavior can't silently
 * diverge from the tests. Two independent conditions can hide a banner on top
 * of an explicit dismiss:
 *
 * - `expiresOn` — an absolute sunset date that hides the banner for everyone.
 * - `autoDismissAfterDays` — hides the banner a number of days after the
 *   individual reader first saw it (tracked per-reader via a first-seen
 *   timestamp).
 */

export const MS_PER_DAY = 86_400_000;

export interface BannerVisibilityInput {
  /** Current time in epoch milliseconds. */
  nowMs: number;
  /** Absolute sunset time in epoch milliseconds, if configured. */
  expiresOnMs?: number | null;
  /** Auto-dismiss window in days after first seen, if configured. */
  autoDismissAfterDays?: number | null;
  /** When the reader first saw this banner (epoch ms), or null if never. */
  firstSeenMs?: number | null;
  /** Whether the reader explicitly dismissed this banner. */
  dismissed?: boolean;
}

export interface BannerVisibilityResult {
  /** Whether the banner should be shown to the reader right now. */
  visible: boolean;
  /**
   * When set, the caller should persist this value as the reader's first-seen
   * timestamp. Only returned on the reader's first view of a banner that uses
   * `autoDismissAfterDays`.
   */
  persistFirstSeenMs?: number;
}

/**
 * Parse a stored first-seen value (as read from `localStorage`) into a
 * trustworthy epoch-ms timestamp.
 *
 * `Number.parseInt` is intentionally *not* used here: it accepts junk like
 * `'12abc'` (→ 12) and negative values (→ a 1970-era time), both of which would
 * make {@link resolveBannerVisibility} treat the banner as long-expired and hide
 * it permanently with no way to recover. This requires a positive integer no
 * later than `nowMs` and returns `null` for anything else, so the caller falls
 * back to a fresh first view and overwrites the bad value.
 */
export function parseFirstSeen(raw: string | null | undefined, nowMs: number): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  // Digits only — rejects '', '-5', '1.5', '12abc', '0x10', '1e3', etc.
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  // A first-seen time in the future is impossible (clock skew / tampering);
  // reject it so it self-heals rather than hiding the banner until it passes.
  if (value > nowMs) return null;
  return value;
}

/** Whether an absolute `expiresOn` sunset has been reached. */
export function isBannerDateExpired(nowMs: number, expiresOnMs?: number | null): boolean {
  return typeof expiresOnMs === 'number' && Number.isFinite(expiresOnMs) && nowMs >= expiresOnMs;
}

/**
 * Whether the per-reader auto-dismiss window has elapsed. Returns `false` when
 * the window isn't configured or the reader has no recorded first-seen time.
 */
export function isBannerAutoDismissed(
  nowMs: number,
  firstSeenMs?: number | null,
  autoDismissAfterDays?: number | null
): boolean {
  if (typeof autoDismissAfterDays !== 'number' || autoDismissAfterDays <= 0) return false;
  if (typeof firstSeenMs !== 'number' || !Number.isFinite(firstSeenMs)) return false;
  return nowMs >= firstSeenMs + autoDismissAfterDays * MS_PER_DAY;
}

/**
 * Resolve whether a banner should be visible, and whether the caller needs to
 * record a first-seen timestamp. Precedence: explicit dismiss and the absolute
 * sunset always win; otherwise the first view of an auto-dismissing banner is
 * shown (and its first-seen time captured) and later views are hidden once the
 * window elapses.
 */
export function resolveBannerVisibility(input: BannerVisibilityInput): BannerVisibilityResult {
  const { nowMs, expiresOnMs, autoDismissAfterDays, dismissed } = input;

  if (dismissed) return { visible: false };
  if (isBannerDateExpired(nowMs, expiresOnMs)) return { visible: false };

  const usesAutoDismiss =
    typeof autoDismissAfterDays === 'number' && autoDismissAfterDays > 0;

  if (!usesAutoDismiss) return { visible: true };

  const hasFirstSeen =
    typeof input.firstSeenMs === 'number' && Number.isFinite(input.firstSeenMs);

  // First view: show it and tell the caller to start the reader's timer.
  if (!hasFirstSeen) return { visible: true, persistFirstSeenMs: nowMs };

  if (isBannerAutoDismissed(nowMs, input.firstSeenMs, autoDismissAfterDays)) {
    return { visible: false };
  }

  return { visible: true };
}
