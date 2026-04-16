import type { StarlightRouteData } from '@astrojs/starlight/route-data';

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

interface JsonObject {
  [key: string]: JsonValue;
}

interface FaqEntry {
  answer: string;
  question: string;
}

const defaultSiteUrl = 'https://aspire.dev';
const organizationName = 'Aspire';
const organizationAlternateNames = ['.NET Aspire', 'Aspire.dev'];
const organizationDescription =
  'Aspire is an agent-ready, code-first tool for building, running, debugging, and deploying distributed apps for any language, stack, or cloud.';
const softwareDescription =
  'Aspire is an agent-ready, code-first tool for composing, debugging, and deploying any distributed app, no matter programming language, stack, or cloud.';
const sameAsLinks = [
  'https://github.com/microsoft/aspire',
  'https://github.com/dotnet/aspire',
  'https://learn.microsoft.com/dotnet/aspire/',
  'https://devblogs.microsoft.com/aspire',
  'https://x.com/aspiredotdev',
  'https://bsky.app/profile/aspire.dev',
  'https://www.youtube.com/@aspiredotdev',
  'https://www.twitch.tv/aspiredotdev',
] as const;
const aspireConfName = 'Aspire Conf 2026';
const aspireConfReplayUrl =
  'https://www.youtube.com/playlist?list=PLSi5JsxQ5oNvRCeQj5v6ZYUe1gwzTSUfR';
const aspireConfStartDate = '2026-03-23T09:00:00-07:00';
const aspireConfEndDate = '2026-03-23T16:45:00-07:00';

export function getStructuredData(
  route: StarlightRouteData,
  currentUrl: URL,
  site?: URL
): string | undefined {
  const entryId = normalizeEntryId(route.entry.id);
  if (is404Page(entryId)) {
    return undefined;
  }

  const siteUrl = resolveSiteUrl(site, currentUrl);
  const pageUrl = resolvePageUrl(route, currentUrl, siteUrl);
  const language = route.entryMeta.lang || route.lang;
  const description = route.entry.data.description ?? organizationDescription;

  if (isHomePage(entryId)) {
    return JSON.stringify(buildHomePageSchema(siteUrl, language, description));
  }

  if (isFaqPage(entryId)) {
    const faqPageSchema = buildFaqPageSchema(route, siteUrl, pageUrl, language, description);
    if (faqPageSchema) {
      return JSON.stringify(faqPageSchema);
    }
  }

  if (isAspireConfPage(entryId)) {
    return JSON.stringify(buildAspireConfSchema(siteUrl, pageUrl, language, description));
  }

  const releaseVersion = getReleaseVersion(entryId);
  if (releaseVersion) {
    return JSON.stringify(
      buildReleaseNotesSchema(route, siteUrl, pageUrl, language, description, releaseVersion)
    );
  }

  return JSON.stringify(buildTechArticleSchema(route, siteUrl, pageUrl, language, description));
}

function buildHomePageSchema(siteUrl: string, language: string, description: string): JsonObject {
  const organizationId = `${siteUrl}/#org`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: organizationName,
        alternateName: [...organizationAlternateNames],
        url: `${siteUrl}/`,
        logo: `${siteUrl}/og-image.png`,
        description,
        sameAs: [...sameAsLinks],
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: organizationName,
        publisher: { '@id': organizationId },
        inLanguage: language,
      },
    ],
  };
}

function buildFaqPageSchema(
  route: StarlightRouteData,
  siteUrl: string,
  pageUrl: string,
  language: string,
  description: string
): JsonObject | undefined {
  const faqEntries = extractFaqEntries(route.entry.body);
  if (faqEntries.length === 0) {
    return undefined;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    name: route.entry.data.title,
    description,
    url: pageUrl,
    inLanguage: language,
    publisher: buildPublisher(siteUrl),
    about: buildSoftwareApplication(siteUrl),
    mainEntity: faqEntries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer,
      },
    })),
  };
}

function buildAspireConfSchema(
  siteUrl: string,
  pageUrl: string,
  language: string,
  description: string
): JsonObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: aspireConfName,
    description,
    url: pageUrl,
    inLanguage: language,
    image: `${siteUrl}/og-image.png`,
    organizer: buildPublisher(siteUrl),
    about: buildSoftwareApplication(siteUrl),
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventCompleted',
    startDate: aspireConfStartDate,
    endDate: aspireConfEndDate,
    isAccessibleForFree: true,
    location: {
      '@type': 'VirtualLocation',
      url: pageUrl,
    },
    sameAs: aspireConfReplayUrl,
  };
}

function buildTechArticleSchema(
  route: StarlightRouteData,
  siteUrl: string,
  pageUrl: string,
  language: string,
  description: string
): JsonObject {
  return {
    '@context': 'https://schema.org',
    ...buildTechArticleNode(route, siteUrl, pageUrl, language, description),
  };
}

function buildReleaseNotesSchema(
  route: StarlightRouteData,
  siteUrl: string,
  pageUrl: string,
  language: string,
  description: string,
  releaseVersion: string
): JsonObject {
  const releaseId = `${pageUrl}#release`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        ...buildTechArticleNode(route, siteUrl, pageUrl, language, description),
        '@id': `${pageUrl}#article`,
        about: { '@id': releaseId },
      },
      {
        ...buildSoftwareApplication(siteUrl),
        '@id': releaseId,
        softwareVersion: releaseVersion,
      },
    ],
  };
}

function buildTechArticleNode(
  route: StarlightRouteData,
  siteUrl: string,
  pageUrl: string,
  language: string,
  description: string
): JsonObject {
  return {
    '@type': 'TechArticle',
    headline: route.entry.data.title,
    description,
    author: buildPublisher(siteUrl),
    publisher: buildPublisher(siteUrl),
    url: pageUrl,
    inLanguage: language,
    about: buildSoftwareApplication(siteUrl),
  };
}

function buildPublisher(siteUrl: string): JsonObject {
  return {
    '@type': 'Organization',
    name: organizationName,
    url: `${siteUrl}/`,
  };
}

function buildSoftwareApplication(siteUrl: string): JsonObject {
  return {
    '@type': 'SoftwareApplication',
    name: organizationName,
    alternateName: [...organizationAlternateNames],
    description: softwareDescription,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Windows, macOS, Linux',
    url: `${siteUrl}/`,
  };
}

function resolveSiteUrl(site: URL | undefined, currentUrl: URL): string {
  const siteHref = site?.href ?? new URL('/', currentUrl).href ?? defaultSiteUrl;
  return siteHref.replace(/\/$/, '');
}

function resolvePageUrl(route: StarlightRouteData, currentUrl: URL, siteUrl: string): string {
  const canonicalHref = route.head.find(
    (entry) =>
      entry.tag === 'link' &&
      entry.attrs?.rel === 'canonical' &&
      typeof entry.attrs.href === 'string'
  )?.attrs?.href;

  if (typeof canonicalHref === 'string') {
    return canonicalHref;
  }

  return ensureTrailingSlash(new URL(currentUrl.pathname, `${siteUrl}/`).href);
}

function normalizeEntryId(entryId: string): string {
  return entryId.replace(/\\/g, '/');
}

function extractFaqEntries(body: string): FaqEntry[] {
  const entries: FaqEntry[] = [];
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  let currentQuestion: string | undefined;
  let currentAnswerLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      appendFaqEntry(entries, currentQuestion, currentAnswerLines);
      currentQuestion = cleanInlineMarkdown(line.slice(3));
      currentAnswerLines = [];
      continue;
    }

    if (currentQuestion) {
      currentAnswerLines.push(line);
    }
  }

  appendFaqEntry(entries, currentQuestion, currentAnswerLines);
  return entries;
}

function appendFaqEntry(
  entries: FaqEntry[],
  question: string | undefined,
  answerLines: string[]
): void {
  if (!question) {
    return;
  }

  const answer = cleanFaqAnswer(answerLines);
  if (!answer) {
    return;
  }

  entries.push({ question, answer });
}

function cleanFaqAnswer(answerLines: string[]): string {
  const cleanedLines: string[] = [];
  let inCodeBlock = false;
  let previousWasBlank = false;

  for (const line of answerLines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock || trimmed.startsWith('Learn more:')) {
      continue;
    }

    if (!trimmed) {
      if (!previousWasBlank && cleanedLines.length > 0) {
        cleanedLines.push('');
      }
      previousWasBlank = true;
      continue;
    }

    const cleanedLine = cleanInlineMarkdown(trimmed)
      .replace(/^\d+\.\s+/, '')
      .replace(/^[-*]\s+/, '');

    if (!cleanedLine) {
      continue;
    }

    cleanedLines.push(cleanedLine);
    previousWasBlank = false;
  }

  while (cleanedLines[cleanedLines.length - 1] === '') {
    cleanedLines.pop();
  }

  return cleanedLines.join('\n').trim();
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function is404Page(entryId: string): boolean {
  return /^([a-z]{2}(?:-[a-z]{2,4})?\/)?404\.mdx?$/i.test(entryId);
}

function isFaqPage(entryId: string): boolean {
  return /^([a-z]{2}(?:-[a-z]{2,4})?\/)?get-started\/faq\.mdx?$/i.test(entryId);
}

function isAspireConfPage(entryId: string): boolean {
  return /^([a-z]{2}(?:-[a-z]{2,4})?\/)?aspireconf\/index\.mdx?$/i.test(entryId);
}

function isHomePage(entryId: string): boolean {
  return /^([a-z]{2}(?:-[a-z]{2,4})?\/)?index\.mdx?$/i.test(entryId);
}

function getReleaseVersion(entryId: string): string | undefined {
  const match = entryId.match(
    /^(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?whats-new\/aspire-(\d+(?:-\d+)*)\.mdx?$/i
  );

  return match ? match[1].replace(/-/g, '.') : undefined;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
