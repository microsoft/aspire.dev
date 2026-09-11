import { describe, expect, it } from 'vitest';
import { createGenerator } from 'unocss';
import unoConfig from '../../uno.config';
import ResourceBrowser from '../../src/components/dev-center/ResourceBrowser.astro';
import ResourceCard from '../../src/components/dev-center/ResourceCard.astro';
import { topicLinks } from '../../src/data/dev-central';
import { getTopicForEntry } from '../../src/utils/topic-resolver';
import { RESOURCE_TYPES, type DevResource } from '../../src/utils/dev-center/resource-types';
import { resourcePresentation } from '../../src/utils/dev-center/resource-presentation';
import { renderComponent } from './astro-test-utils';

const base: DevResource = {
  id: 'guide:sample', title: 'A guide to Aspire', description: 'Connect services and explore your app.',
  href: '/get-started/first-app/', type: 'guide', topics: ['foundations'],
  tags: ['getting-started'], languages: ['TypeScript'], providers: [],
};

describe('resource browser rendering', () => {
  it('keeps all Dev Hub topic icons aligned with their sidebar topics', () => {
    for (const topic of topicLinks) {
      const sidebarTopic = getTopicForEntry(topic.href.slice(1, -1));
      expect(sidebarTopic.label).toBe(topic.title);
      expect(topic.icon).toBe(sidebarTopic.iconName);
    }
  });

  it('renders every resource kind with a real destination and accessible heading', async () => {
    for (const kind of RESOURCE_TYPES) {
      const html = await renderComponent(ResourceCard, { props: { resource: { ...base, type: kind.id } } });
      expect(html).toContain(`data-resource-type="${kind.id}"`);
      expect(html).toContain('href="/get-started/first-app/"');
      expect(html).toContain('aria-labelledby="resource-guide%3Asample"');
      expect(html).toContain(kind.label);
      expect(html).toContain('browse-card-preview');
      expect(html).toContain('browse-artwork-symbol');
      expect(html).not.toContain('browse-artwork-brand');
      expect(html).not.toContain('browse-artwork-context');
      expect(html).not.toContain('browse-card-topic');
      expect(html).toContain('A guide to Aspire');
      expect(html).not.toContain('undefined');
    }
  });

  it('shows the resource classification once in the image header, not the footer', async () => {
    const html = await renderComponent(ResourceCard, {
      props: { resource: { ...base, type: 'integration', topics: ['integrations'] } },
    });

    expect(html.match(/>Integration<\/span>/g)).toHaveLength(1);
    expect(html).not.toMatch(/>Integrations</);
    expect(html.indexOf('class="browse-card-kind')).toBeLessThan(html.indexOf('class="browse-card-copy'));
    expect(html.indexOf('<h3')).toBeLessThan(html.indexOf('<p '));
    expect(html).not.toContain('class="browse-card-meta');
  });

  it('varies grain placement by resource identity without changing it between renders', async () => {
    const renderStyle = async (id: string) => {
      const html = await renderComponent(ResourceCard, { props: { resource: { ...base, id } } });
      return html.match(/style="([^"]*--grain-x:[^"]*)"/)?.[1];
    };
    const first = await renderStyle(base.id);
    expect(first).toMatch(/--resource-accent: .+; --grain-x: \d+%; --grain-y: \d+%/);
    expect(await renderStyle(base.id)).toBe(first);
    expect(await renderStyle('guide:another-resource')).not.toBe(first);
  });

  it('renders thumbnail variants without changing the destination or opening a player', async () => {
    const resource = {
      ...base, type: 'video' as const, href: 'https://www.youtube.com/watch?v=example',
      image: { light: 'https://i.ytimg.com/vi/example/hqdefault.jpg', dark: 'https://i.ytimg.com/vi/example/hqdefault.jpg' },
    };
    const html = await renderComponent(ResourceCard, { props: { resource } });
    expect(html).toContain(resource.image.light);
    expect(html).toContain('width="640" height="360"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('target="_blank"');
  });

  it('keeps package logos contained when their article is a quickstart', async () => {
    const html = await renderComponent(ResourceCard, {
      props: { resource: {
        ...base, type: 'quickstart',
        image: { light: 'https://example.com/light.svg', dark: 'https://example.com/dark.svg', kind: 'logo' },
      } },
    });

    expect(html).toContain('browse-card-artwork');
    expect(html).toContain('browse-artwork-symbol');
    expect(html).toContain('width="80" height="80"');
    expect(html).toContain('browse-image-dark');
    expect(html).toContain('>Quickstart</span>');
  });

  it.each([
    ['reference', '/reference/cli/commands/aspire-docs-api-search/', 'CLI command', 'aspire docs api search', 'command'],
    ['diagnostic', '/diagnostics/aspire001/', 'Diagnostic', 'ASPIRE001', 'diagnostic'],
    ['release-notes', '/whats-new/aspire-13-4/', 'Release notes', '13.4', 'release'],
  ] as const)('gives %s artwork its real content identity', async (type, href, label, identifier, variant) => {
    const html = await renderComponent(ResourceCard, { props: { resource: { ...base, type, href } } });
    expect(html).toContain(`data-artwork="${variant}"`);
    expect(html).toContain(`>${identifier}</code>`);
    expect(html).toContain(`>${label}</span>`);
    expect(html).toContain('aria-hidden="true"');
  });

  it.each(['/reference/cli/overview/', '/reference/cli/commands/aspire-run/'])('uses terminal artwork rather than a dollar sign for %s', (href) => {
    expect(resourcePresentation({ ...base, type: 'reference', href }).icon).toBe('seti:powershell');
  });

  it('uses featured imagery instead of fallback artwork even for integration articles', async () => {
    const html = await renderComponent(ResourceCard, { props: { resource: {
      ...base, type: 'integration', image: { light: '/feature.png', dark: '/feature.png' },
    } } });
    expect(html).toContain('src="/feature.png"');
    expect(html).toContain('width="640" height="360"');
    expect(html).not.toContain('class="browse-artwork-symbol');
  });

  it('keeps all resource links in initial HTML and progressively enables controls', async () => {
    const resources = [base, { ...base, id: 'glossary:apphost', title: 'AppHost', href: '/dev/glossary/apphost/', type: 'glossary' as const }];
    const html = await renderComponent(ResourceBrowser, { props: { resources } });
    expect(html).toContain('href="/get-started/first-app/"');
    expect(html).toContain('href="/dev/glossary/apphost/"');
    expect(html).toContain('name="type" value="guide"');
    expect(html).toContain('name="type" value="glossary"');
    expect(html).toContain('name="topic" value="foundations"');
    expect(html).toContain('role="search"');
    expect(html).toContain('All resources are listed below.');
    expect(html).toContain('name="language"');
    expect(html).toContain('type="checkbox" name="language" value="TypeScript"');
    expect(html).not.toContain('<select name="language"');
    expect(html).toContain('data-filter-group="language"');
    expect(html).toContain('data-filter-active="language"');
    expect(html).not.toContain('data-selected-count');
    expect(html).toContain('role="group" aria-label="Filter resources"');
    expect(html).not.toContain('name="provider"');
  });

  it('escapes resource copy instead of treating it as HTML', async () => {
    const html = await renderComponent(ResourceCard, {
      props: { resource: { ...base, title: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' } },
    });
    const cardContent = html.slice(html.indexOf('<a '));
    expect(cardContent).not.toContain('<script>alert(1)</script>');
    expect(cardContent).not.toContain('<img src=x');
    expect(cardContent).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('renders custom menus without option search for provider and sorting too', async () => {
    const html = await renderComponent(ResourceBrowser, { props: { resources: [{ ...base, providers: ['azure', 'aws'] }] } });
    expect(html).not.toContain('<select');
    expect(html).toContain('type="radio" name="provider" value="azure"');
    expect(html).toMatch(/type="radio" name="provider" value(?:=""|\s)/);
    expect(html).toContain('type="radio" name="sort-date" value="newest"');
    expect(html).not.toContain('data-sort-direction');
    expect(html).toContain('type="radio" name="sort-date" value="oldest"');
    expect(html).toContain('type="radio" name="sort-title" value="asc"');
    expect(html).toContain('type="radio" name="sort-title" value="desc"');
    expect(html.match(/role="radiogroup"/g)).toHaveLength(2);
    expect(html).toContain('data-sort-selection="date"');
    expect(html).toContain('data-sort-selection="title"');
    for (const icon of unoConfig.safelist ?? []) expect(html).toContain(icon);
    expect(html).toContain('aria-label="Date order"');
    expect(html).toContain('aria-label="Title order"');
    expect(html).toContain('data-option-label="Date"');
    expect(html).toContain('data-option-label="Title"');
    expect(html).not.toContain('Best match');
    expect(html).not.toContain('browse-option-search');
    expect(html).not.toContain('Filter options...');
    expect(html).toContain('data-option-label="AWS"');
    expect(html).not.toContain('No matching options');
  });

  it('generates Material Design sorting and pagination icons from the configured safelist', async () => {
    const uno = await createGenerator(unoConfig);
    const { css } = await uno.generate('');
    for (const icon of [
      'page-first', 'page-last',
      'sort-calendar-ascending', 'sort-calendar-descending',
      'sort-alphabetical-ascending', 'sort-alphabetical-descending',
    ]) {
      expect(css).toContain(`.i-mdi\\:${icon}`);
    }
  });

  it('renders accessible first/previous/next/last controls and numbered pages', async () => {
    const html = await renderComponent(ResourceBrowser, { props: { resources: [base] } });
    expect(html).toContain('aria-label="Resource pages"');
    expect(html).toContain('data-page-previous aria-label="Previous"');
    expect(html).toContain('data-page-next aria-label="Next"');
    expect(html).toContain('data-page-first aria-label="First page"');
    expect(html).toContain('data-page-last aria-label="Last page"');
    expect(html).toContain('data-page-numbers');
    expect(html).toContain('data-page-label');
  });

  it('renders deduplicated language icons with an accessible card description', async () => {
    const html = await renderComponent(ResourceCard, { props: { resource: { ...base, languages: ['TypeScript', 'typescript', 'csharp', 'go'] } } });
    expect(html).toContain('aria-describedby="resource-guide%3Asample-languages"');
    expect(html).toContain('Languages: TypeScript, C#, Go');
    expect(html.match(/data-resource-language="typescript"/g)).toHaveLength(1);
    for (const language of ['typescript', 'csharp', 'go']) {
      expect(html).toContain(`data-resource-language="${language}"`);
      expect(html).toContain(`${language}.svg`);
    }
  });

  it('omits empty language badges and retains a readable fallback for languages without artwork', async () => {
    const empty = await renderComponent(ResourceCard, { props: { resource: { ...base, languages: [] } } });
    expect(empty).not.toContain('aria-describedby');
    expect(empty).not.toContain('data-resource-language');
    const fallback = await renderComponent(ResourceCard, { props: { resource: { ...base, languages: ['fsharp'] } } });
    expect(fallback).toContain('Languages: F#');
    expect(fallback).toContain('title="F#"');
    expect(fallback).toContain('>F#</span>');
  });
});
