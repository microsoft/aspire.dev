import type { Token } from 'marked';

/**
 * Drops the leading `# Title` line from a sample README so the page's own
 * hero/title isn't duplicated as the first heading rendered into the body.
 */
export function stripReadmeTitle(readme: string): string {
  return readme.replace(/^#\s+.+\r?\n+/, '');
}

/**
 * Lower-cases, strips punctuation, and collapses whitespace into a stable
 * `kebab-case` id, mirroring Starlight's heading-slugger so anchor links
 * resolve. Returns `'section'` as a fallback when the input collapses to
 * an empty string.
 */
export function slugifyHeading(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'section';
}

/**
 * Identifies tokens that should bypass the `toSentenceCase` lower-casing —
 * camelCase identifiers, anything with digits, all-caps acronyms (≥2 chars),
 * and words containing technical punctuation (`.#/+_-`) so e.g. `.NET`,
 * `AppHost`, `OTel`, `PostgreSQL` round-trip unchanged.
 */
export function shouldPreserveWord(word: string): boolean {
  const trimmed = word.replace(/^[^\p{Letter}\p{Number}]+|[^\p{Letter}\p{Number}]+$/gu, '');
  return (
    trimmed.length === 0 ||
    /[a-z][A-Z]/.test(trimmed) ||
    /\d/.test(trimmed) ||
    /^[A-Z]{2,}$/.test(trimmed) ||
    /[.#/+_-]/.test(trimmed)
  );
}

/**
 * Converts a string to sentence case while preserving words that look like
 * code identifiers / acronyms (see `shouldPreserveWord`). Only the first
 * non-preserved word is capitalised — the rest are lower-cased.
 */
export function toSentenceCase(value: string): string {
  const words = value.trim().split(/(\s+)/);
  let firstWordSeen = false;

  return words
    .map((word) => {
      if (/^\s+$/.test(word) || shouldPreserveWord(word)) {
        if (!firstWordSeen && !/^\s+$/.test(word)) {
          firstWordSeen = true;
        }
        return word;
      }

      if (!firstWordSeen) {
        firstWordSeen = true;
        return word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase();
      }

      return word.toLocaleLowerCase();
    })
    .join('');
}

/**
 * Marked's inline token types all expose a `text` field but the union type
 * doesn't declare a common shape, so we narrow to the few token variants
 * the README headings use ({@link Tokens.Text}, {@link Tokens.Codespan},
 * etc.) when concatenating raw heading text. `raw` is the fallback for
 * tokens where `text` is empty (e.g. some inline HTML tokens).
 */
type HeadingChildToken = { text?: unknown; raw?: unknown };

function tokenText(token: Token): string {
  const candidate = token as HeadingChildToken;
  if (typeof candidate.text === 'string') return candidate.text;
  if (typeof candidate.raw === 'string') return candidate.raw;
  return '';
}

/**
 * Rewrites a heading's inline tokens so their visible text matches the
 * sentence-cased heading. Preserves token order and lengths so each token's
 * share of the heading text stays aligned with the original token (e.g. a
 * `<strong>` over the second word still wraps the second word).
 */
export function normalizeHeadingTokens(tokens: Token[] = []): Token[] {
  let remainingText: string | null = toSentenceCase(tokens.map(tokenText).join(''));

  return tokens.map((token) => {
    const original = token as HeadingChildToken;
    if (remainingText === null || typeof original.text !== 'string') {
      return token;
    }

    const normalized = remainingText.slice(0, original.text.length);
    remainingText = remainingText.slice(original.text.length);
    return {
      ...token,
      raw: normalized,
      text: normalized,
    };
  });
}

