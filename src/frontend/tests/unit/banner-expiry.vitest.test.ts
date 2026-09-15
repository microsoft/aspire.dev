import { describe, expect, test } from 'vitest';

import {
  MS_PER_DAY,
  isBannerAutoDismissed,
  isBannerDateExpired,
  parseFirstSeen,
  resolveBannerVisibility,
} from '../../src/utils/banner-expiry';

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0); // 2026-08-05T12:00:00Z

describe('parseFirstSeen', () => {
  test('returns null for missing values', () => {
    expect(parseFirstSeen(null, NOW)).toBeNull();
    expect(parseFirstSeen(undefined, NOW)).toBeNull();
    expect(parseFirstSeen('', NOW)).toBeNull();
    expect(parseFirstSeen('   ', NOW)).toBeNull();
  });

  test('rejects non-integer and malformed values instead of coercing them', () => {
    // `Number.parseInt` would salvage a bogus prefix (e.g. 12) from these;
    // that is exactly the bug this guards against.
    expect(parseFirstSeen('12abc', NOW)).toBeNull();
    expect(parseFirstSeen('1.5', NOW)).toBeNull();
    expect(parseFirstSeen('1e3', NOW)).toBeNull();
    expect(parseFirstSeen('0x10', NOW)).toBeNull();
    expect(parseFirstSeen(' 12  abc', NOW)).toBeNull();
  });

  test('rejects zero, negative, and future timestamps', () => {
    expect(parseFirstSeen('0', NOW)).toBeNull();
    expect(parseFirstSeen('-5', NOW)).toBeNull();
    expect(parseFirstSeen(String(NOW + 1), NOW)).toBeNull();
  });

  test('accepts a positive integer timestamp no later than now', () => {
    expect(parseFirstSeen(String(NOW), NOW)).toBe(NOW);
    expect(parseFirstSeen(String(NOW - MS_PER_DAY), NOW)).toBe(NOW - MS_PER_DAY);
    expect(parseFirstSeen('  ' + String(NOW - 1) + '  ', NOW)).toBe(NOW - 1);
  });
});

describe('isBannerDateExpired', () => {
  test('is false when no sunset is configured', () => {
    expect(isBannerDateExpired(NOW, null)).toBe(false);
    expect(isBannerDateExpired(NOW, undefined)).toBe(false);
  });

  test('is false before the sunset and true at/after it', () => {
    expect(isBannerDateExpired(NOW, NOW + 1)).toBe(false);
    expect(isBannerDateExpired(NOW, NOW)).toBe(true); // boundary is inclusive
    expect(isBannerDateExpired(NOW, NOW - 1)).toBe(true);
  });

  test('ignores non-finite timestamps', () => {
    expect(isBannerDateExpired(NOW, Number.NaN)).toBe(false);
  });
});

describe('isBannerAutoDismissed', () => {
  test('is false without a window or a first-seen time', () => {
    expect(isBannerAutoDismissed(NOW, NOW - 10 * MS_PER_DAY, null)).toBe(false);
    expect(isBannerAutoDismissed(NOW, null, 7)).toBe(false);
    expect(isBannerAutoDismissed(NOW, NOW, 0)).toBe(false);
  });

  test('is true only once the window has fully elapsed', () => {
    const firstSeen = NOW - 7 * MS_PER_DAY;
    expect(isBannerAutoDismissed(firstSeen + 1, firstSeen, 7)).toBe(false);
    expect(isBannerAutoDismissed(firstSeen + 7 * MS_PER_DAY, firstSeen, 7)).toBe(true);
    expect(isBannerAutoDismissed(firstSeen + 7 * MS_PER_DAY + 1, firstSeen, 7)).toBe(true);
  });
});

describe('resolveBannerVisibility', () => {
  test('is visible with no expiry configured', () => {
    expect(resolveBannerVisibility({ nowMs: NOW })).toEqual({ visible: true });
  });

  test('explicit dismiss always hides it', () => {
    expect(
      resolveBannerVisibility({ nowMs: NOW, dismissed: true, autoDismissAfterDays: 14 })
    ).toEqual({ visible: false });
  });

  test('past absolute sunset hides it for everyone', () => {
    expect(resolveBannerVisibility({ nowMs: NOW, expiresOnMs: NOW - 1 })).toEqual({
      visible: false,
    });
  });

  test('future absolute sunset keeps it visible', () => {
    expect(resolveBannerVisibility({ nowMs: NOW, expiresOnMs: NOW + MS_PER_DAY })).toEqual({
      visible: true,
    });
  });

  test('first view of an auto-dismissing banner shows it and records first-seen', () => {
    expect(resolveBannerVisibility({ nowMs: NOW, autoDismissAfterDays: 14 })).toEqual({
      visible: true,
      persistFirstSeenMs: NOW,
    });
  });

  test('a rejected/garbage first-seen value self-heals as a fresh first view', () => {
    // parseFirstSeen turns junk into null; resolveBannerVisibility then treats
    // it as a first view and asks the caller to overwrite the bad value, so a
    // corrupt localStorage entry can never hide the banner permanently.
    const firstSeenMs = parseFirstSeen('-5', NOW); // null
    expect(
      resolveBannerVisibility({ nowMs: NOW, autoDismissAfterDays: 14, firstSeenMs })
    ).toEqual({ visible: true, persistFirstSeenMs: NOW });
  });

  test('stays visible within the auto-dismiss window without re-recording', () => {
    const firstSeen = NOW - 5 * MS_PER_DAY;
    expect(
      resolveBannerVisibility({ nowMs: NOW, autoDismissAfterDays: 14, firstSeenMs: firstSeen })
    ).toEqual({ visible: true });
  });

  test('hides once the auto-dismiss window has elapsed', () => {
    const firstSeen = NOW - 15 * MS_PER_DAY;
    expect(
      resolveBannerVisibility({ nowMs: NOW, autoDismissAfterDays: 14, firstSeenMs: firstSeen })
    ).toEqual({ visible: false });
  });

  test('absolute sunset wins even during a live first-seen window', () => {
    const firstSeen = NOW - MS_PER_DAY;
    expect(
      resolveBannerVisibility({
        nowMs: NOW,
        expiresOnMs: NOW - 1,
        autoDismissAfterDays: 30,
        firstSeenMs: firstSeen,
      })
    ).toEqual({ visible: false });
  });
});
