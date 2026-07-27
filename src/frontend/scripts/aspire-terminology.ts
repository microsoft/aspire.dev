const horizontalWhitespace = String.raw`[ \t]+`;
// Markdown emphasis/link openers can sit between an article and a term in raw
// README/AppHost content (e.g. `a **.NET Aspire**` or `a [.NET Aspire](url)`), so
// the article corrector consumes them to stay grammatical after the term shrinks.
const markdownOpeners = String.raw`[*\[]*`;

interface TerminologyRule {
  /**
   * Case-insensitive regex source matching the deprecated term. Use
   * `${horizontalWhitespace}` for internal spaces, `\b` to bound word-character
   * edges, and `(?<!\w)` when the term can start mid-token (like `.NET`, which
   * must not be preceded by a word character or `ASP.NET Aspire` would corrupt).
   */
  readonly pattern: string;
  /** Canonical replacement text. */
  readonly replacement: string;
  /**
   * Indefinite article the replacement should take. Set this only when the
   * replacement's leading sound differs from the term's, so a preceding `a`/`an`
   * is corrected (e.g. `a .NET Aspire` -> `an Aspire`).
   */
  readonly article?: 'a' | 'an';
}

// Adding a rule here normalizes a new term everywhere generated sample and
// integration data is written. Keep this list in sync with the deprecated terms
// in `.github/forbidden-words.json`.
const terminologyRules: readonly TerminologyRule[] = [
  {
    pattern: String.raw`(?<!\w)\.NET${horizontalWhitespace}Aspire`,
    replacement: 'Aspire',
    article: 'an',
  },
  {
    pattern: String.raw`\bdotnet${horizontalWhitespace}aspire\b`,
    replacement: 'Aspire',
    article: 'an',
  },
  {
    pattern: String.raw`\bapp${horizontalWhitespace}host\b`,
    replacement: 'AppHost',
  },
];

export function normalizeAspireTerminology(text: string): string {
  return terminologyRules.reduce(applyRule, text);
}

function applyRule(text: string, rule: TerminologyRule): string {
  const corrected = rule.article ? correctArticle(text, rule, rule.article) : text;
  return corrected.replace(new RegExp(rule.pattern, 'gi'), rule.replacement);
}

// Rewrite a preceding indefinite article when the replacement changes the
// leading sound, tolerating Markdown wrappers between the article and the term.
function correctArticle(text: string, rule: TerminologyRule, article: 'a' | 'an'): string {
  const capitalized = article === 'a' ? 'A' : 'An';
  const withArticle = new RegExp(
    String.raw`\b([Aa])${horizontalWhitespace}(${markdownOpeners})${rule.pattern}\b`,
    'gi'
  );
  return text.replace(
    withArticle,
    (_match, matchedArticle: string, opener: string) =>
      `${matchedArticle === 'A' ? capitalized : article} ${opener}${rule.replacement}`
  );
}
