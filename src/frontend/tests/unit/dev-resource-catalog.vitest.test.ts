import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { describe, expect, it, vi } from 'vitest';
import samples from '../../src/data/samples.json';
import integrations from '../../src/data/aspire-integrations.json';
import integrationDocs from '../../src/data/integration-docs.json';
import blogPosts from '../../src/data/aspire-blog-posts.json';
import { allCommunityVideos, aspireifridays, communityVideos, dotnetConf2025 } from '../../src/data/community-videos';
import { blogHighlights, videos } from '../../src/data/dev-central';
import { locales } from '../../config/locales';
import { socialConfig } from '../../config/socials.config';
import { redirects } from '../../config/redirects.mjs';
import {
  buildResourceCatalog, canonicalDestination, classifyDoc, docHref, docTopics,
  isEnglishResourcePath, youtubeId, type CatalogDoc, type CatalogSources,
} from '../../src/utils/dev-center/catalog-normalization';
import { RESOURCE_TYPES } from '../../src/utils/dev-center/resource-types';
import { sampleDetailHref } from '../../src/utils/samples';

const root = fileURLToPath(new URL('../../', import.meta.url));
const empty: CatalogSources = {
  docs: [], glossary: [], samples: [], integrations: [], integrationDocs: [], videos: [], blogs: [],
};
const doc = (id: string, data: Partial<CatalogDoc['data']> = {}): CatalogDoc => ({
  id, data: { title: `Document ${id}`, description: 'A useful documentation page.', ...data },
});

function readContent(directory: string): CatalogDoc[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_') || !isEnglishResourcePath(entry.name)) return [];
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readContent(filePath);
    if (!/\.mdx?$/.test(entry.name)) return [];
    const base = path.join(root, 'src', 'content', directory.includes('glossary') ? 'glossary' : 'docs');
    const parsed = parseFrontmatter(readFileSync(filePath, 'utf8'));
    const data = parsed.frontmatter as CatalogDoc['data'];
    return [{
      id: data.slug ?? path.relative(base, filePath).replace(/\\/g, '/').replace(/\.mdx?$/, '').replace(/(^|\/)index$/, ''),
      filePath,
      body: parsed.content,
      data,
    }];
  });
}

const docs = readContent(path.join(root, 'src', 'content', 'docs'));
const glossary = readContent(path.join(root, 'src', 'content', 'glossary')) as CatalogSources['glossary'];
const sources: CatalogSources = {
  docs, glossary, samples, integrations, integrationDocs,
  videos: [
    ...allCommunityVideos,
    ...videos.map((video) => ({
      href: `https://www.youtube.com/watch?v=${video.id}`, title: video.title,
      description: video.series, tags: [video.series],
    })),
  ],
  blogs: [...blogPosts, ...blogHighlights],
  redirectPaths: Object.keys(redirects),
};
const catalog = buildResourceCatalog(sources);

vi.mock('astro:content', () => ({ getCollection: vi.fn() }));

describe('resource catalog normalization', () => {
  it('publishes the complete ordered UI type contract', () => {
    expect(RESOURCE_TYPES.map(({ id }) => id)).toEqual([
      'guide', 'quickstart', 'tutorial', 'how-to', 'sample', 'integration',
      'diagnostic', 'glossary', 'video', 'blog', 'reference', 'release-notes',
    ]);
    expect(new Set(RESOURCE_TYPES.map(({ id }) => id)).size).toBe(12);
  });

  it('uses every supported locale configuration key, not a fixed locale list', () => {
    for (const [locale, { lang }] of Object.entries(locales)) {
      if (locale === 'root') continue;
      expect(isEnglishResourcePath(`${locale}/get-started/first-app`)).toBe(false);
      expect(isEnglishResourcePath(`${lang}/get-started/first-app`)).toBe(false);
    }
    expect(isEnglishResourcePath('integrations/frameworks/python')).toBe(true);
    expect(buildResourceCatalog({ ...empty, docs: [
      doc('guide'), doc('fr/guide'), { ...doc('translated-slug'), filePath: 'src/content/docs/ja/guide.mdx' },
    ] }).map(({ id }) => id)).toEqual(['doc:guide']);
  });

  it('honors canonical slugs and index routes without mangling names ending in index', () => {
    expect(docHref(doc('old', { slug: 'new/page' }))).toBe('/new/page/');
    expect(docHref(doc('fundamentals/index'))).toBe('/fundamentals/');
    expect(docHref(doc('reference/search-index'))).toBe('/reference/search-index/');
    expect(canonicalDestination('/')).toBe('/');
    expect(canonicalDestination('https://aspire.dev/fundamentals/index?aspire-lang=csharp#start')).toBe('/fundamentals/');
  });

  it('omits only explicit non-resources, redirects, translations and hidden content', () => {
    const entries = [
      doc(''), doc('404'), doc('support'), doc('aspireconf'), doc('community/thanks'),
      doc('reference/api/csharp/type'), doc('old'), doc('draft', { draft: true }),
      doc('hidden', { hidden: true }), doc('unlisted', { unlisted: true }),
      doc('sidebar-hidden', { sidebar: { hidden: true } }), doc('redirect', { redirect: '/new/' }),
      doc('private', { head: [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } }] }),
      doc('diagnostics/aspire001'), doc('reference/cli/overview'), doc('whats-new/aspire-13-5'),
      doc('community/videos'),
    ];
    expect(buildResourceCatalog({ ...empty, docs: entries, redirectPaths: ['/old/'] }).map(({ href }) => href).sort()).toEqual([
      '/community/videos/', '/diagnostics/aspire001/', '/reference/cli/overview/', '/whats-new/aspire-13-5/',
    ]);
  });

  it('uses explicit categories then deterministic paths, never arbitrary prose', () => {
    const cases = [
      ['get-started/first-app', 'quickstart'], ['get-started/deploy-first-app', 'tutorial'],
      ['get-started/add-aspire-existing-app', 'how-to'], ['diagnostics/aspire001', 'diagnostic'],
      ['reference/cli/overview', 'reference'], ['integrations/databases/redis', 'integration'],
      ['whats-new/aspire-13-5', 'release-notes'], ['whats-new/upgrade-aspire', 'guide'],
      ['blog/launch', 'blog'], ['random/path', 'guide'],
    ] as const;
    for (const [id, type] of cases) expect(classifyDoc(doc(id))).toBe(type);
    expect(classifyDoc(doc('random/path', { category: 'tutorial' }))).toBe('tutorial');
    expect(classifyDoc(doc('integrations/custom/lesson', { category: 'tutorial' }))).toBe('tutorial');
    expect(classifyDoc(doc('integrations/custom/setup', { category: 'quickstart' }))).toBe('quickstart');
    expect(classifyDoc(doc('integrations/caching/redis/redis-get-started'))).toBe('integration');
    expect(classifyDoc(doc('example-get-started'))).toBe('guide');
    expect(classifyDoc(doc('random/path', { title: 'Tutorial quickstart Azure Redis reference' }))).toBe('guide');
    expect(docTopics(doc('deployment/azure'))).toEqual(['deployment']);
    expect(docTopics(doc('dashboard/explore'))).toEqual(['dashboard']);
    expect(docTopics(doc('unknown/path', { topic: 'integrations' }))).toEqual(['integrations']);
    expect(docTopics(doc('unknown/path', { description: 'Deploy an Azure database with Python.' }))).toEqual([]);
  });

  it('excludes includes by route, original ID, and source path even with slug overrides', () => {
    const entries = [
      doc('includes/shared'),
      doc('reference/cli/includes/option-help'),
      doc('reference/cli/includes/renamed', { slug: 'public-fragment' }),
      { ...doc('another-fragment'), filePath: 'C:\\repo\\src\\content\\docs\\reference\\cli\\includes\\shared.md' },
      doc('reference/cli/includes-overview'),
    ];
    expect(buildResourceCatalog({ ...empty, docs: entries }).map(({ href }) => href)).toEqual([
      '/reference/cli/includes-overview/',
    ]);
  });

  it('merges packages into canonical docs and preserves package search metadata', () => {
    const result = buildResourceCatalog({ ...empty,
      docs: [{ ...doc('integrations/new', { slug: 'integrations/canonical', category: 'quickstart' }), filePath: 'src/content/docs/integrations/old.mdx' }],
      integrations: [
        { title: 'Hosting.Redis', href: 'https://nuget.org/packages/Hosting.Redis', description: 'Hosting package', tags: ['redis'], icon: 'https://example.com/redis.svg' },
        { title: 'Client.Redis', href: 'https://nuget.org/packages/Client.Redis', description: 'Client package', tags: ['client'] },
        { title: 'NoDocs', href: 'https://nuget.org/packages/NoDocs', description: 'No docs yet' },
      ],
      integrationDocs: [
        { match: 'hosting.redis', href: '/integrations/old/' },
        { match: 'Client.Redis', href: 'https://aspire.dev/integrations/canonical/?aspire-lang=csharp' },
        { match: 'NoDocs', href: '/integrations/missing/' },
      ],
    });
    expect(result).toHaveLength(2);
    const merged = result.find(({ href }) => href === '/integrations/canonical/')!;
    expect(merged).toMatchObject({ type: 'quickstart', topics: ['integrations'], image: { kind: 'logo', light: 'https://example.com/redis.svg' } });
    expect(merged.tags).toEqual(expect.arrayContaining(['Hosting.Redis', 'Client.Redis', 'redis', 'client']));
    expect(result.find(({ title }) => title === 'NoDocs')?.href).toBe('https://nuget.org/packages/NoDocs');
  });

  it('uses the site AWS logo variants instead of the single NuGet logo', () => {
    const aws = catalog.find(({ href }) => href === '/integrations/cloud/aws/overview/');
    expect(aws?.image).toEqual({
      light: '~/assets/icons/aws-light-icon.png',
      dark: '~/assets/icons/aws-icon.png',
      kind: 'logo',
    });
  });

  it('canonicalizes video variants and external tracking without losing timestamped links', () => {
    const url = 'https://youtu.be/UjQ-fVkwqpY?t=158';
    expect(canonicalDestination(url)).toBe(canonicalDestination('https://www.youtube.com/watch?v=UjQ-fVkwqpY'));
    expect(canonicalDestination('https://www.youtube.com/shorts/UjQ-fVkwqpY?feature=share')).toBe(canonicalDestination(url));
    expect(canonicalDestination('https://devblogs.microsoft.com/aspire/post/?utm_source=feed#comment')).toBe('https://devblogs.microsoft.com/aspire/post');
    const result = buildResourceCatalog({ ...empty, videos: [
      { href: url, title: 'First', description: 'Description', tags: ['Live'] },
      { href: 'https://www.youtube.com/watch?v=UjQ-fVkwqpY', title: 'Alternate title', description: 'Description', tags: ['Community'] },
    ] });
    expect(result).toHaveLength(1);
    expect(result[0].href).toBe(url);
    expect(result[0].tags).toEqual(expect.arrayContaining(['Live', 'Community', 'Alternate title']));
  });

  it('prefers featured artwork to OG overrides and leaves missing images unset', () => {
    const entries = buildResourceCatalog({ ...empty, docs: [
      doc('featured', { resourceImage: { light: '/light.png', dark: '/dark.png' }, ogImage: '/og.png' }),
      doc('og', { ogImage: '/og.png' }),
      doc('plain'),
    ] });
    expect(entries.find(({ id }) => id === 'doc:featured')?.image).toEqual({ light: '/light.png', dark: '/dark.png' });
    expect(entries.find(({ id }) => id === 'doc:og')?.image).toEqual({ light: '/og.png', dark: '/og.png' });
    expect(entries.find(({ id }) => id === 'doc:plain')?.image).toBeUndefined();
  });

  it('merges curated blog overlaps without replacing official metadata or losing unique posts', () => {
    const result = buildResourceCatalog({ ...empty, blogs: [
      { title: 'Official title', description: 'Official excerpt', href: 'https://devblogs.microsoft.com/aspire/post/', date: '2026-08-18', image: 'https://example.com/featured.png' },
      { title: 'Curated title', description: 'Curated summary', href: 'https://devblogs.microsoft.com/aspire/post/?utm_source=hub', date: '2026-08-17' },
      { title: 'External post', description: 'External summary', href: 'https://example.com/post/' },
    ] });
    expect(result).toHaveLength(2);
    expect(result.find(({ title }) => title === 'Official title')).toMatchObject({
      description: 'Official excerpt', date: '2026-08-18',
      image: { light: 'https://example.com/featured.png', dark: 'https://example.com/featured.png' },
      tags: ['Curated title'],
    });
  });

  it('fails loudly on conflicting source identities, destinations, mappings and unsafe URLs', () => {
    expect(() => buildResourceCatalog({ ...empty, docs: [doc('same'), doc('same')] })).toThrow('Conflicting resource ID');
    expect(() => buildResourceCatalog({ ...empty, docs: [doc('same', { slug: 'one' }), doc('same', { slug: 'two' })] })).toThrow('Conflicting resource ID');
    expect(() => buildResourceCatalog({ ...empty, docs: [doc('one', { slug: 'same' }), doc('two', { slug: 'same' })] })).toThrow('Conflicting resource destination');
    expect(() => buildResourceCatalog({ ...empty, integrationDocs: [{ match: 'One', href: '/one/' }, { match: 'one', href: '/two/' }] })).toThrow('Duplicate integration documentation mapping');
    expect(() => buildResourceCatalog({ ...empty, integrations: [
      { title: 'One', href: 'https://nuget.org/packages/One', description: '' },
      { title: 'one', href: 'https://nuget.org/packages/one', description: '' },
    ] })).toThrow('Duplicate integration package');
    expect(() => canonicalDestination('javascript:alert(1)')).toThrow('Invalid resource URL');
    expect(() => canonicalDestination('//evil.example/path')).toThrow('Invalid resource URL');
  });
});

describe('current source coverage', () => {
  it('uses existing release screenshots and preserves a fallback for articles without artwork', () => {
    const releases = catalog.filter(({ type }) => type === 'release-notes');
    expect(releases.filter(({ image }) => image)).toHaveLength(11);
    expect(releases.find(({ href }) => href === '/whats-new/aspire-13-4/')?.image).toBeUndefined();
    for (const resource of releases) {
      for (const asset of [resource.image?.light, resource.image?.dark].filter((value) => value !== undefined)) {
        expect(existsSync(path.join(root, 'src', asset.replace(/^~\//, ''))), asset).toBe(true);
      }
    }
  });

  it('indexes AppHost and consuming-client examples under each demonstrated language', () => {
    for (const href of [
      '/get-started/first-app/',
      '/integrations/ai/openai/openai-host/',
    ]) {
      expect(catalog.find((entry) => entry.href === href)?.languages, href).toEqual(expect.arrayContaining(['csharp', 'typescript']));
    }
    for (const href of [
      '/integrations/ai/openai/openai-connect/',
      '/integrations/caching/redis/redis-connect/',
    ]) {
      expect(catalog.find((entry) => entry.href === href)?.languages, href).toEqual(expect.arrayContaining(['csharp', 'go', 'python', 'typescript']));
    }
    expect(catalog.find(({ href }) => href === '/integrations/custom-integrations/client-integrations/')?.languages).toContain('csharp');
  });
  it('keeps shared include fragments out of the resource directory', () => {
    const fragments = docs.filter(({ filePath }) => filePath?.replace(/\\/g, '/').includes('/includes/'));
    expect(fragments.length).toBeGreaterThan(0);
    for (const fragment of fragments) {
      expect(catalog.some(({ href }) => href === docHref(fragment)), fragment.id).toBe(false);
    }
  });

  it.each([
    ['tutorial', [
      'get-started/deploy-first-app',
      'integrations/custom-integrations/hosting-integrations',
      'integrations/custom-integrations/client-integrations',
      'integrations/custom-integrations/secure-communication',
      'dashboard/standalone-for-nodejs',
      'dashboard/standalone-for-python',
      'testing/write-your-first-test',
      'integrations/databases/efcore/migrations',
    ]],
    ['quickstart', [
      'get-started/first-app',
      'get-started/dev-containers',
      'get-started/github-codespaces',
      'integrations/frameworks/deno/deno-get-started',
      'integrations/frameworks/java/java-get-started',
      'integrations/frameworks/perl/perl-get-started',
      'integrations/frameworks/powershell/powershell-get-started',
      'integrations/frameworks/rust/rust-get-started',
      'integrations/devtools/k6/k6-get-started',
      'integrations/devtools/sql-projects/sql-projects-get-started',
    ]],
  ] as const)('classifies the reviewed %s articles from frontmatter without losing their topics', (type, paths) => {
    for (const path of paths) {
      const source = docs.find((entry) => docHref(entry) === `/${path}/`);
      expect(source?.data.category, path).toBe(type);
      expect(catalog.find(({ href }) => href === `/${path}/`), path).toMatchObject({
        type, topics: docTopics(source!),
      });
    }
  });

  it('uses the same complete sources through the Astro build-time adapter', async () => {
    const { getCollection } = await import('astro:content');
    vi.mocked(getCollection).mockImplementation((name: string) => {
      if (name === 'docs') return Promise.resolve(docs as never);
      if (name === 'glossary') return Promise.resolve(glossary as never);
      throw new Error(`Unexpected collection: ${name}`);
    });
    const { getResourceCatalog } = await import('../../src/utils/dev-center/catalog');
    expect(__ASPIRE_REDIRECT_PATHS__).toEqual(Object.keys(redirects));
    const actual = await getResourceCatalog();
    const officialSources = {
      ...sources,
      videos: sources.videos.filter((video) =>
        video.tags.includes('Official') || videos.some((featured) => featured.id === youtubeId(video.href))),
    };
    expect(actual.filter(({ id }) => !id.startsWith('channel:'))).toEqual(buildResourceCatalog(officialSources));
    for (const social of socialConfig.filter(({ icon }) => icon === 'youtube' || icon === 'twitch')) {
      expect(actual.find(({ id }) => id === `channel:${social.icon}`)).toMatchObject({
        href: social.href, type: 'video', platform: social.icon,
      });
    }
    expect(actual.some(({ id }) => id === 'video:QvSDRRGv8cs')).toBe(false);
    expect(getCollection).toHaveBeenCalledWith('docs');
    expect(getCollection).toHaveBeenCalledWith('glossary');
  });

  it('includes every sample with its real canonical detail page and theme-aware thumbnail', () => {
    expect(catalog.filter(({ type }) => type === 'sample')).toHaveLength(samples.length);
    for (const sample of samples) {
      const actual = catalog.find(({ id }) => id === `sample:${sample.name}`)!;
      expect(actual.href).toBe(sampleDetailHref('', sample.name));
      expect(actual.tags).toEqual(expect.arrayContaining(sample.tags));
      if (typeof sample.thumbnail === 'object' && sample.thumbnail) expect(actual.image).toEqual(sample.thumbnail);
      expect(actual.description.length).toBeLessThanOrEqual(280);
    }
  });

  it('covers all packages, including clients and packages without documentation', () => {
    for (const integration of integrations) {
      expect(catalog.some(({ tags }) => tags.includes(integration.title)), integration.title).toBe(true);
    }
    expect(catalog.some(({ tags }) => tags.includes('client'))).toBe(true);
    const unmapped = integrations.filter((integration) => !integrationDocs.some(({ match }) => match.toLowerCase() === integration.title.toLowerCase()));
    expect(unmapped.length).toBeGreaterThan(0);
    for (const integration of unmapped) {
      expect(catalog.some(({ href }) => canonicalDestination(href) === canonicalDestination(integration.href)), integration.title).toBe(true);
    }
  });

  it('preserves all 32 original community videos, series, descriptions and MDX exports', () => {
    expect([aspireifridays.length, dotnetConf2025.length, communityVideos.length]).toEqual([17, 7, 8]);
    const originalIds = [
      'UjQ-fVkwqpY', 'c7-Xeg67IUs', 'PDwtUpipWbA', 'dCwwvXmclEs', 'XXYvI11Rz7g', 'Js06lpu_YsM',
      'MbTHQCO5TEo', 'IEXiSAMMRdU', 'Z1EjpsOAZBU', '29zIIH9rMtU', '80ckukH-29w', 'rrurHUfzyTY',
      '9ORep52vuQk', 'P7JJcTVe1Xo', 'inowoXFbP9s', 'IuDgGIuNqG4', 'zbm4BzIN6rk',
      'FcAi-kqo3ps', '8NoetLolw-0', 'p_zslgBi06k', 'u0iK6Bv5BZ0', 'aXouOsBh4ro', 'UQiL3nbQbtM', 'dJdXdRiIfDw',
      'sKGx3mOPlB0', 'QvSDRRGv8cs', 'dftmYBuZOLA', 'EvxmwQKJ4Nw', 'g-fKXzrNOhI', 'J02mvcEKrsI', 'fN3ufsIF7vs', 'dJ4uEANZIdQ',
    ];
    expect(allCommunityVideos.map(({ href }) => youtubeId(href))).toEqual(originalIds);
    for (const video of allCommunityVideos) {
      const actual = catalog.find(({ id }) => id === `video:${youtubeId(video.href)}`)!;
      expect(actual.title).toBe(video.title);
      expect(actual.description).toBe(video.description);
      expect(actual.href).toBe(video.href);
      expect(actual.tags).toEqual(expect.arrayContaining(video.tags));
    }
    const mdx = readFileSync(path.join(root, 'src', 'content', 'docs', 'community', 'videos.mdx'), 'utf8');
    expect(mdx).toContain("from '@data/community-videos'");
    expect(mdx).toContain('export { aspireifridays, dotnetConf2025, communityVideos };');
    expect(mdx).toContain('<YouTube id="u5_yOjzgmCM"');
    for (const video of videos) expect(catalog.some(({ id }) => id === `video:${video.id}`)).toBe(true);
  });

  it('includes glossary and every official and curated blog destination exactly once', () => {
    expect(catalog.filter(({ type }) => type === 'glossary')).toHaveLength(glossary.length);
    for (const term of glossary) expect(catalog.find(({ id }) => id === `glossary:${term.id}`)?.tags).toEqual(expect.arrayContaining(term.data.aliases));
    const blogDestinations = new Set([...blogPosts, ...blogHighlights].map(({ href }) => canonicalDestination(href)));
    const actual = catalog.filter(({ type, href }) => type === 'blog' && href.startsWith('https://'));
    expect(actual).toHaveLength(blogDestinations.size);
    expect(new Set(actual.map(({ href }) => canonicalDestination(href)))).toEqual(blogDestinations);
    for (const blog of blogPosts) {
      expect(actual.find(({ href }) => href === blog.href)).toMatchObject({
        title: blog.title, date: blog.date,
        image: { light: blog.image, dark: blog.image },
      });
    }
  });

  it('is deterministic, unique, bounded, and never serializes bodies, READMEs or API symbols', () => {
    expect(catalog).toEqual(buildResourceCatalog(sources));
    expect(new Set(catalog.map(({ id }) => id)).size).toBe(catalog.length);
    expect(new Set(catalog.map(({ href }) => canonicalDestination(href))).size).toBe(catalog.length);
    expect(catalog.map(({ title }) => title)).toEqual(catalog.map(({ title }) => title).sort((a, b) => a.localeCompare(b, 'en')));
    expect(catalog.every(({ href }) => !href.startsWith('/reference/api/'))).toBe(true);
    expect(catalog.every(({ href }) => !href.startsWith('/') || isEnglishResourcePath(href))).toBe(true);
    for (const entry of catalog) {
      expect(entry).not.toHaveProperty('body');
      expect(entry).not.toHaveProperty('readme');
      expect(entry).not.toHaveProperty('readmeRaw');
      expect(entry).not.toHaveProperty('appHostCode');
    }
  });
});
