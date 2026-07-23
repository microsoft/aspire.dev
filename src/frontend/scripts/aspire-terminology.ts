const horizontalWhitespace = String.raw`[ \t]+`;
const legacyAspirePattern = String.raw`\.NET${horizontalWhitespace}Aspire`;
const legacyAppHostPattern = String.raw`\bapp${horizontalWhitespace}host\b`;

const aspireWithArticle = new RegExp(
  String.raw`\b([Aa])${horizontalWhitespace}${legacyAspirePattern}\b`,
  'gi'
);
const legacyAspire = new RegExp(legacyAspirePattern, 'gi');
const legacyAppHost = new RegExp(legacyAppHostPattern, 'gi');

export function normalizeAspireTerminology(text: string): string {
  return text
    .replace(aspireWithArticle, (_match, article: string) =>
      article === 'A' ? 'An Aspire' : 'an Aspire'
    )
    .replace(legacyAspire, 'Aspire')
    .replace(legacyAppHost, 'AppHost');
}
