/**
 * Inline markup in Go API descriptions.
 *
 * Descriptions are single-line strings generated from XML documentation. Besides
 * plain text they carry:
 *
 *   `error`                          inline code
 *   `IResourceBuilder`1`             CLR type arity: one code span, shown without the arity
 *   `WithModTidy``1`                 CLR method arity: one code span, shown without the arity
 *   ``` var x = 1; ```               a code sample flattened onto one line
 *   {@ats-ref type:Resource}         a reference to another API item
 *   {@ats-ref method:Owner.member}   a reference to a method
 *   [RFC 7239](https://example.com)  an external link
 *
 * Anything else, including a lone backtick, stays plain text. This module has no
 * imports so the client-side search scripts can bundle it.
 */

export type GoDocRefKind = 'type' | 'method' | 'field';

export type GoDocSegment =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'ref'; refKind: GoDocRefKind; target: string; label: string }
  | { kind: 'link'; text: string; href: string };

const FENCE = /```([^`]+)```/;
// The CLR arity suffix is part of the name and contains backticks: one for a type
// (`Name`1`) and two for a method (`Name``1`). A run of one or two backticks followed
// by digits and another backtick therefore does not end the span.
const INLINE_CODE = /`((?:[^`\n]|`{1,2}\d+(?=`))+)`/;
const REF = /\{@ats-ref\s+(type|method|field):([^\s|}]+)(?:\|([^}]*))?\}/;
// Only http(s) targets become links, so a description cannot smuggle in a javascript: URL.
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/;

// Alternatives are ordered so a fence is not read as three empty code spans.
// Capture groups: 1 fence, 2 inline code, 3-5 ref (kind, target, label), 6-7 link (text, href).
const TOKEN_PATTERN = new RegExp(
  [FENCE, INLINE_CODE, REF, LINK].map((pattern) => pattern.source).join('|'),
  'g'
);
const REF_PATTERN = new RegExp(REF.source, 'g');
const ARITY_CODE_PATTERN = /`([^`\s]+)`{1,2}\d+`/g;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function stripClrArity(name: string): string {
  return name.replace(/`{1,2}\d+$/, '');
}

export function parseGoDocText(text: string): GoDocSegment[] {
  const segments: GoDocSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const [token, fenced, inline, refKind, refTarget, refLabel, linkText, linkHref] = match;
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, start) });
    }

    if (fenced !== undefined) {
      segments.push({ kind: 'code', text: fenced.trim() });
    } else if (inline !== undefined) {
      segments.push({ kind: 'code', text: stripClrArity(inline) });
    } else if (refKind !== undefined) {
      segments.push({
        kind: 'ref',
        refKind: refKind as GoDocRefKind,
        target: refTarget,
        label: refLabel?.trim() || refTarget,
      });
    } else {
      segments.push({ kind: 'link', text: linkText, href: linkHref });
    }
    cursor = start + token.length;
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) });
  }
  return segments;
}

function formatGoDocText(
  text: string,
  formatLink: (label: string, href: string) => string
): string {
  return parseGoDocText(text)
    .map((segment) => {
      switch (segment.kind) {
        case 'text':
          return segment.text;
        case 'code':
          return `\`${segment.text}\``;
        case 'ref':
          return `\`${segment.label}\``;
        case 'link':
          return formatLink(segment.text, segment.href);
      }
    })
    .join('');
}

/**
 * Search entries keep a description as text with `code` spans, so one string serves
 * matching and display. A result row is itself a link, so external links keep only their label.
 */
export function toSearchGoDocText(text: string): string {
  return formatGoDocText(text, (label) => label);
}

/** Cut a search summary without leaving half of a `code` span behind. */
export function truncateGoDocText(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }

  let cut = text.slice(0, max);
  if ((cut.match(/`/g) ?? []).length % 2 === 1) {
    cut = cut.slice(0, cut.lastIndexOf('`'));
  }
  return cut.trimEnd();
}

/**
 * Render search-entry text for the result rows, which are built as HTML strings.
 * Every value is escaped and no anchors are emitted: the row is already an anchor.
 */
export function renderGoDocTextHtml(text: string): string {
  return parseGoDocText(text)
    .map((segment) => {
      switch (segment.kind) {
        case 'text':
          return escapeHtml(segment.text);
        case 'code':
          return `<code class="go-doc-code">${escapeHtml(segment.text)}</code>`;
        case 'ref':
          return `<code class="go-doc-ref">${escapeHtml(segment.label)}</code>`;
        case 'link':
          return escapeHtml(segment.text);
      }
    })
    .join('');
}

/**
 * Markdown output keeps its own code spans, fenced blocks and links, so only the two
 * Go-specific markers are rewritten: references become code and CLR arity is dropped.
 */
export function normalizeGoDocMarkdown(text: string): string {
  return text
    .replace(
      REF_PATTERN,
      (_match, _kind: string, target: string, label?: string) => `\`${label?.trim() || target}\``
    )
    .replace(ARITY_CODE_PATTERN, '`$1`');
}
