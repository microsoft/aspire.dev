import englishTranslations from '../content/i18n/en.json';

export interface AspireQuote {
  heading: string;
  text: string;
  href: string;
}

export interface AspireQuoteDefinition extends AspireQuote {
  id: string;
}

const quoteLinks: Record<string, string> = {
  '01': '/get-started/ai-coding-agents/',
  '02': '/get-started/what-is-aspire/',
  '03': '/get-started/app-host/',
  '04': '/get-started/first-app/',
  '05': '/languages-and-runtimes/',
  '06': '/architecture/resource-model/',
  '07': '/fundamentals/telemetry/',
  '08': '/deployment/',
  '09': '/integrations/',
  '10': '/get-started/app-host/',
  '11': '/get-started/what-is-aspire/',
  '12': '/deployment/app-lifecycle/',
  '13': '/community/',
  '14': '/deployment/',
  '15': '/architecture/resource-model/',
  '16': '/get-started/what-is-aspire/',
  '17': '/fundamentals/service-discovery/',
  '18': '/deployment/environments/',
  '19': '/get-started/first-app/',
  '20': '/get-started/what-is-aspire/',
  '21': '/languages-and-runtimes/',
  '22': '/dashboard/overview/',
  '23': '/deployment/',
  '24': '/architecture/resource-model/',
  '25': '/get-started/what-is-aspire/',
  '26': '/get-started/what-is-aspire/',
  '27': '/get-started/app-host/',
  '28': '/architecture/overview/',
  '29': '/get-started/what-is-aspire/',
};

export const englishStatementPlayer = englishTranslations.landing.statementPlayer;

export const aspireQuoteDefinitions: readonly AspireQuoteDefinition[] = Object.entries(
  englishStatementPlayer.quotes
)
  .sort(([leftId], [rightId]) => Number(leftId) - Number(rightId))
  .map(([id, quote]) => {
    const href = quoteLinks[id];
    if (!href) {
      throw new Error(`Aspire statement ${id} is missing its Learn more destination.`);
    }

    return { id, ...quote, href };
  });

export const aspireQuotes: readonly AspireQuote[] = aspireQuoteDefinitions;
