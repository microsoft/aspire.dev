export function normalizeAspireTerminology(text: string): string {
  return text
    .replace(/\b([Aa]) \.NET Aspire\b/gi, (_match, article: string) =>
      article === 'A' ? 'An Aspire' : 'an Aspire'
    )
    .replace(/\.NET Aspire/gi, 'Aspire')
    .replace(/\bapp host\b/gi, 'AppHost');
}
