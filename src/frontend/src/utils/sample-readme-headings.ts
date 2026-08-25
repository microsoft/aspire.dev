import type { PhrasingContent } from 'mdast';

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
 * Concatenates the visible text of a heading's inline MDAST nodes. Leaf nodes
 * (`text`, `inlineCode`) carry the characters on `value`; wrapping nodes
 * (`emphasis`, `strong`, `delete`, `link`, …) carry them on nested `children`,
 * so we recurse to collect each leaf's contribution exactly once.
 */
export function headingPlainText(nodes: readonly PhrasingContent[]): string {
  return nodes.map(nodeText).join('');
}

function nodeText(node: PhrasingContent): string {
  if (node.type === 'text' || node.type === 'inlineCode') {
    return node.value;
  }

  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map(nodeText).join('');
  }

  return '';
}

/**
 * Rewrites a heading's inline MDAST nodes so their visible text matches the
 * sentence-cased heading. Preserves node order, nesting, and per-leaf lengths
 * so each node's share of the heading text stays aligned with the original
 * (e.g. a `strong` over the second word still wraps the second word). Sentence
 * casing never changes string length, so slicing the rewritten text by each
 * leaf's original `value.length` keeps every node in register.
 */
export function normalizeHeadingNodes(nodes: readonly PhrasingContent[] = []): PhrasingContent[] {
  let remaining: string | null = toSentenceCase(headingPlainText(nodes));

  const rewrite = (node: PhrasingContent): PhrasingContent => {
    if (remaining === null) {
      return node;
    }

    if (node.type === 'text' || node.type === 'inlineCode') {
      const normalized = remaining.slice(0, node.value.length);
      remaining = remaining.slice(node.value.length);
      return { ...node, value: normalized };
    }

    if ('children' in node && Array.isArray(node.children)) {
      return { ...node, children: node.children.map(rewrite) };
    }

    return node;
  };

  return nodes.map(rewrite);
}
