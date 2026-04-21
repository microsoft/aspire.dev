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
const escapedJsonCharacters: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function getStructuredData(
  route: StarlightRouteData,
  currentUrl: URL,
  site?: URL
): string | undefined {
  const contentBasePath = getContentBasePath(route);
  if (contentBasePath === '404') {
    return undefined;
  }

  const siteUrl = resolveSiteUrl(site, currentUrl);
  const pageUrl = resolvePageUrl(route, currentUrl, siteUrl);
  const language = route.entryMeta.lang || route.lang;
  const description = route.entry.data.description ?? organizationDescription;
  const structuredData = buildStructuredData(
    route,
    contentBasePath,
    siteUrl,
    pageUrl,
    language,
    description
  );

  return structuredData ? serializeStructuredData(structuredData) : undefined;
}

function isHomePagePath(contentBasePath: string): boolean {
  return contentBasePath === 'index' || contentBasePath === '';
}

function isCommunityPagePath(contentBasePath: string): boolean {
  return contentBasePath === 'community' || contentBasePath === 'community/index';
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

function buildStructuredData(
  route: StarlightRouteData,
  contentBasePath: string,
  siteUrl: string,
  pageUrl: string,
  language: string,
  description: string
): JsonObject {
  if (isHomePagePath(contentBasePath)) {
    return buildHomePageSchema(siteUrl, language, description);
  }

  if (isCommunityPagePath(contentBasePath)) {
    return buildCommunityPageSchema(route, siteUrl, pageUrl, language, description);
  }

  if (contentBasePath === 'get-started/faq') {
    return (
      buildFaqPageSchema(route, siteUrl, pageUrl, language, description) ??
      buildTechArticleSchema(route, siteUrl, pageUrl, language, description)
    );
  }

  if (contentBasePath === 'aspireconf' || contentBasePath === 'aspireconf/index') {
    return buildAspireConfSchema(siteUrl, pageUrl, language, description);
  }

  const releaseVersion = getReleaseVersion(contentBasePath);
  if (releaseVersion) {
    return buildReleaseNotesSchema(route, siteUrl, pageUrl, language, description, releaseVersion);
  }

  return buildTechArticleSchema(route, siteUrl, pageUrl, language, description);
}

function buildCommunityPageSchema(
  route: StarlightRouteData,
  siteUrl: string,
  pageUrl: string,
  language: string,
  description: string
): JsonObject {
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
        description: organizationDescription,
        sameAs: [...sameAsLinks],
      },
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: route.entry.data.title,
        description,
        inLanguage: language,
        isPartOf: { '@id': `${siteUrl}/#website` },
        about: { '@id': organizationId },
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
  const faqEntries = extractFaqEntries(route.entry.body ?? '');
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
  const publisher = buildPublisher(siteUrl);

  return {
    '@type': 'TechArticle',
    headline: route.entry.data.title,
    description,
    author: publisher,
    publisher,
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

function serializeStructuredData(structuredData: JsonObject): string {
  return JSON.stringify(structuredData).replace(
    /[<>&\u2028\u2029]/g,
    (character) => escapedJsonCharacters[character] ?? character
  );
}

function resolveSiteUrl(site: URL | undefined, currentUrl: URL): string {
  const siteHref = site?.href ?? new URL('/', currentUrl).href;
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

function getContentBasePath(route: StarlightRouteData): string {
  const entryId = normalizeEntryId(route.entry.id);
  const localePrefix = route.locale ? `${route.locale}/` : '';
  const contentPath =
    localePrefix && entryId.startsWith(localePrefix) ? entryId.slice(localePrefix.length) : entryId;

  return stripMarkdownExtension(contentPath);
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.mdx?$/i, '');
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
      .replace(/^#{3,6}\s+/, '')
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

function getReleaseVersion(contentBasePath: string): string | undefined {
  if (!contentBasePath.startsWith('whats-new/aspire-')) {
    return undefined;
  }

  const version = contentBasePath.slice('whats-new/aspire-'.length);
  return version ? version.replace(/-/g, '.') : undefined;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
