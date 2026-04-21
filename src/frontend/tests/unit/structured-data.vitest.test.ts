import { describe, expect, it } from 'vitest';

import { getStructuredData } from '@utils/structured-data';

type StarlightRouteData = Parameters<typeof getStructuredData>[0];

interface RouteOverrides {
  entryId?: string;
  title?: string;
  description?: string;
  body?: string;
  locale?: string;
  lang?: string;
  head?: StarlightRouteData['head'];
}

function createRoute(overrides: RouteOverrides = {}): StarlightRouteData {
  const {
    entryId = 'docs/overview.mdx',
    title = 'Test article',
    description = 'Test description',
    body = '',
    locale,
    lang = 'en',
    head = [],
  } = overrides;

  return {
    entry: {
      id: entryId,
      slug: entryId.replace(/\.mdx?$/i, ''),
      filePath: `src/content/docs/${entryId}`,
      body,
      data: {
        title,
        description,
      },
    },
    entryMeta: { lang, dir: 'ltr', locale },
    head,
    lang,
    locale,
    dir: 'ltr',
    id: entryId.replace(/\.mdx?$/i, ''),
    siteTitle: 'Aspire',
    siteTitleHref: '/',
    headings: [],
    sidebar: [],
    hasSidebar: false,
    pagination: { prev: undefined, next: undefined },
    toc: undefined,
    pagefind: true,
    lastUpdated: undefined,
    editUrl: undefined,
    labels: {},
  } as unknown as StarlightRouteData;
}

function parse(raw: string | undefined): Record<string, unknown> {
  expect(raw).toBeDefined();
  return JSON.parse(raw as string) as Record<string, unknown>;
}

const site = new URL('https://aspire.dev/');

describe('getStructuredData', () => {
  describe('home page', () => {
    it('emits an Organization with sameAs + WebSite graph', () => {
      const route = createRoute({
        entryId: 'index.mdx',
        title: 'Aspire',
        description: 'Your stack, streamlined.',
      });

      const json = parse(getStructuredData(route, new URL('https://aspire.dev/'), site));

      expect(json['@context']).toBe('https://schema.org');
      const graph = json['@graph'] as Array<Record<string, unknown>>;
      expect(Array.isArray(graph)).toBe(true);

      const org = graph.find((node) => node['@type'] === 'Organization');
      expect(org).toBeDefined();
      expect(org?.name).toBe('Aspire');
      expect(org?.sameAs).toEqual(
        expect.arrayContaining([
          'https://github.com/microsoft/aspire',
          'https://github.com/dotnet/aspire',
          'https://x.com/aspiredotdev',
          'https://bsky.app/profile/aspire.dev',
          'https://www.youtube.com/@aspiredotdev',
        ])
      );

      const website = graph.find((node) => node['@type'] === 'WebSite');
      expect(website).toBeDefined();
      expect(website?.url).toBe('https://aspire.dev/');
      expect(website?.inLanguage).toBe('en');
    });

    it('detects localized home pages', () => {
      const route = createRoute({
        entryId: 'de/index.mdx',
        title: 'Aspire',
        description: 'Your stack, streamlined.',
        lang: 'de',
        locale: 'de',
      });

      const json = parse(getStructuredData(route, new URL('https://aspire.dev/de/'), site));
      const graph = json['@graph'] as Array<Record<string, unknown>>;
      const org = graph.find((node) => node['@type'] === 'Organization');

      expect(org?.sameAs).toBeDefined();
      const website = graph.find((node) => node['@type'] === 'WebSite');
      expect(website?.inLanguage).toBe('de');
    });
  });

  describe('community page', () => {
    it('emits Organization with sameAs and a WebPage', () => {
      const route = createRoute({
        entryId: 'community/index.mdx',
        title: 'Aspire Community',
        description: 'Connect with the Aspire team and community.',
      });

      const json = parse(getStructuredData(route, new URL('https://aspire.dev/community/'), site));
      const graph = json['@graph'] as Array<Record<string, unknown>>;

      const org = graph.find((node) => node['@type'] === 'Organization');
      expect(org?.sameAs).toEqual(expect.arrayContaining(['https://github.com/microsoft/aspire']));

      const webPage = graph.find((node) => node['@type'] === 'WebPage');
      expect(webPage).toBeDefined();
      expect(webPage?.name).toBe('Aspire Community');
      expect(webPage?.url).toBe('https://aspire.dev/community/');
    });
  });

  describe('generic article', () => {
    it('emits a TechArticle without sameAs', () => {
      const route = createRoute({
        entryId: 'docs/get-started.mdx',
        title: 'Get started',
        description: 'Install Aspire and build your first app.',
      });

      const raw = getStructuredData(route, new URL('https://aspire.dev/docs/get-started/'), site);
      const json = parse(raw);

      expect(json['@type']).toBe('TechArticle');
      expect(json.headline).toBe('Get started');
      expect(raw).not.toContain('sameAs');
    });

    it('returns undefined for the 404 page', () => {
      const route = createRoute({ entryId: '404.mdx', title: 'Not found' });
      expect(getStructuredData(route, new URL('https://aspire.dev/404/'), site)).toBeUndefined();
    });
  });

  describe('release notes', () => {
    it('maps aspire-13-2 to softwareVersion 13.2', () => {
      const route = createRoute({
        entryId: 'whats-new/aspire-13-2.mdx',
        title: "What's new in Aspire 13.2",
        description: 'Release notes for Aspire 13.2.',
      });

      const json = parse(
        getStructuredData(route, new URL('https://aspire.dev/whats-new/aspire-13-2/'), site)
      );
      const graph = json['@graph'] as Array<Record<string, unknown>>;
      const app = graph.find((node) => node['@type'] === 'SoftwareApplication');

      expect(app?.softwareVersion).toBe('13.2');
    });
  });

  describe('FAQ page', () => {
    it('extracts question/answer pairs from markdown body', () => {
      const body = [
        '# Intro text that is ignored',
        '',
        '## What is Aspire?',
        '',
        'Aspire is a tool for **distributed** apps. See [docs](/docs/).',
        '',
        'Learn more: https://aspire.dev',
        '',
        '## How do I install it?',
        '',
        '```bash',
        'dotnet tool install',
        '```',
        '',
        'Run the installer and follow the prompts.',
        '',
      ].join('\n');

      const route = createRoute({
        entryId: 'get-started/faq.mdx',
        title: 'FAQ',
        description: 'Frequently asked questions.',
        body,
      });

      const json = parse(
        getStructuredData(route, new URL('https://aspire.dev/get-started/faq/'), site)
      );

      expect(json['@type']).toBe('FAQPage');
      const mainEntity = json.mainEntity as Array<Record<string, unknown>>;
      expect(mainEntity).toHaveLength(2);

      expect(mainEntity[0].name).toBe('What is Aspire?');
      const firstAnswer = (mainEntity[0].acceptedAnswer as Record<string, unknown>).text;
      expect(firstAnswer).toBe('Aspire is a tool for distributed apps. See docs.');

      expect(mainEntity[1].name).toBe('How do I install it?');
      const secondAnswer = (mainEntity[1].acceptedAnswer as Record<string, unknown>).text;
      expect(secondAnswer).toBe('Run the installer and follow the prompts.');
    });

    it('strips nested heading markers from FAQ answers', () => {
      const route = createRoute({
        entryId: 'get-started/faq.mdx',
        title: 'FAQ',
        description: 'Frequently asked questions.',
        body: ['## How does it work?', '', '### Details', 'Aspire helps compose distributed apps.'].join(
          '\n'
        ),
      });

      const json = parse(
        getStructuredData(route, new URL('https://aspire.dev/get-started/faq/'), site)
      );
      const mainEntity = json.mainEntity as Array<Record<string, unknown>>;
      const answer = (mainEntity[0].acceptedAnswer as Record<string, unknown>).text;

      expect(answer).toBe('Details\nAspire helps compose distributed apps.');
      expect(answer).not.toContain('###');
    });

    it('falls back to TechArticle when no FAQ entries are detected', () => {
      const route = createRoute({
        entryId: 'get-started/faq.mdx',
        title: 'FAQ',
        description: 'Frequently asked questions.',
        body: 'No headings here, just prose.',
      });

      const json = parse(
        getStructuredData(route, new URL('https://aspire.dev/get-started/faq/'), site)
      );
      expect(json['@type']).toBe('TechArticle');
    });
  });

  describe('JSON serialization', () => {
    it('escapes <, >, & and U+2028 / U+2029', () => {
      const route = createRoute({
        entryId: 'docs/escaping.mdx',
        title: 'Title with <script> & symbols \u2028 and \u2029',
        description: 'Desc <a> & more \u2028\u2029',
      });

      const raw = getStructuredData(route, new URL('https://aspire.dev/docs/escaping/'), site);
      expect(raw).toBeDefined();

      // Raw serialized JSON must not contain the unescaped characters.
      expect(raw).not.toMatch(/</);
      expect(raw).not.toMatch(/>/);
      expect(raw).not.toMatch(/&/);
      expect(raw).not.toMatch(/\u2028/);
      expect(raw).not.toMatch(/\u2029/);

      expect(raw).toContain('\\u003c');
      expect(raw).toContain('\\u003e');
      expect(raw).toContain('\\u0026');
      expect(raw).toContain('\\u2028');
      expect(raw).toContain('\\u2029');

      // But it must still parse back to the original characters.
      const json = parse(raw);
      expect(json.headline).toBe('Title with <script> & symbols \u2028 and \u2029');
    });
  });
});
