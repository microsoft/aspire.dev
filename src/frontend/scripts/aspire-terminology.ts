const horizontalWhitespace = String.raw`[ \t]+`;
// Require `.NET` to sit at a non-word boundary so longer tokens such as
// `ASP.NET Aspire` or `Microsoft.NET Aspire` are left intact instead of being
// corrupted into `ASPAspire` / `MicrosoftAspire`.
const legacyAspirePattern = String.raw`(?<!\w)\.NET${horizontalWhitespace}Aspire`;
const legacyAppHostPattern = String.raw`\bapp${horizontalWhitespace}host\b`;

// Markdown emphasis/link openers can sit between the article and the term in
// raw README/AppHost content (e.g. `a **.NET Aspire**` or `a [.NET Aspire](url)`).
// Consuming them keeps the article grammatical after the term is shortened.
const markdownOpeners = String.raw`[*\[]*`;
const aspireWithArticle = new RegExp(
  String.raw`\b([Aa])${horizontalWhitespace}(${markdownOpeners})${legacyAspirePattern}\b`,
  'gi'
);
const legacyAspire = new RegExp(legacyAspirePattern, 'gi');
const legacyAppHost = new RegExp(legacyAppHostPattern, 'gi');

export function normalizeAspireTerminology(text: string): string {
  return text
    .replace(
      aspireWithArticle,
      (_match, article: string, opener: string) =>
        `${article === 'A' ? 'An' : 'an'} ${opener}Aspire`
    )
    .replace(legacyAspire, 'Aspire')
    .replace(legacyAppHost, 'AppHost');
}
