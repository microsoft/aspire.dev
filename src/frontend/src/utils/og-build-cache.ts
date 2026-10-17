import { createHash } from 'node:crypto';

export function ogCacheKey(data: object, renderedText: string): string | undefined {
  if (!import.meta.env.PROD || process.env.ASPIRE_INCREMENTAL_BUILD !== '1') return undefined;
  // Emoji SVGs are mutable network inputs. Keep these cards uncached, including
  // flags, joined sequences and keycaps, rather than persisting a degraded image.
  if (/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u20e3]/u.test(renderedText)) {
    return undefined;
  }
  // The enclosing compatibility partition covers renderer code, fonts, local
  // thumbnails, background, topic configuration and the locked native toolchain.
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
