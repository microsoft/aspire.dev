import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { describe, expect, it } from 'vitest';
import GlossaryBrowser from '../../src/components/dev-center/GlossaryBrowser.astro';
import GlossaryCard from '../../src/components/dev-center/GlossaryCard.astro';
import {
  glossaryHref, glossaryLetter, glossaryReturnHref, glossarySearchText, legacyGroups,
  matchesGlossaryQuery, sortGlossary, validateGlossary, type GlossaryTerm,
} from '../../src/utils/dev-center/glossary';
import { topicIds } from '../../src/utils/dev-center/topics';
import { renderComponent } from './astro-test-utils';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'src', 'content', 'glossary');
const terms: GlossaryTerm[] = readdirSync(directory).filter((file) => /\.mdx?$/.test(file)).map((file) => {
  const parsed = parseFrontmatter(readFileSync(path.join(directory, file), 'utf8'));
  return { id: file.replace(/\.mdx?$/, ''), data: parsed.frontmatter as GlossaryTerm['data'], body: parsed.content };
});
const getTerm = (id: string) => terms.find((term) => term.id === id)!;

describe('glossary content migration', () => {
  it('migrates every original term and all API reference table entries', () => {
    expect(terms.map((term) => term.id)).toEqual(expect.arrayContaining([
      'apphost', 'resource', 'distributed-application', 'service-defaults', 'polyglot',
      'withreference', 'waitfor', 'waitforcompletion', 'waitforstart', 'connection-string',
      'service-discovery', 'health-check', 'environment-variable', 'hosting-integration',
      'client-integration', 'integration-relationship', 'run-mode', 'publish-mode',
      'aspire-dashboard', 'opentelemetry', 'emulator-pattern', 'existing-resource-pattern',
      'iresourceannotation', 'withannotation', 'referenceexpression', 'resourcenotificationservice',
      'dag', 'heterogeneous-dag', 'publisher', 'hoisting', 'deferred-evaluation', 'lifecycle-events',
    ]));
  });

  it('has complete metadata and valid related term, topic, and legacy references', () => {
    expect(validateGlossary(terms)).toEqual([]);
    for (const term of terms) {
      expect(term.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(term.data.title.length).toBeGreaterThan(0);
      expect(term.data.description.length).toBeGreaterThan(40);
      expect(term.data.context.length).toBeGreaterThan(40);
      expect(term.body!.trim().length).toBeGreaterThan(100);
      expect(term.data.topics.length).toBeGreaterThan(0);
      expect(term.data.topics.every((topic) => topicIds.includes(topic))).toBe(true);
      expect(term.data.related.length).toBeGreaterThan(0);
      expect(term.data.resources.length).toBeGreaterThan(0);
      expect(Array.isArray(term.data.legacyAnchors)).toBe(true);
    }
  });

  it('retains all former heading anchors and group anchors', () => {
    const anchors = terms.flatMap((term) => term.data.legacyAnchors);
    for (const anchor of [
      'apphost', 'resource', 'distributed-application', 'service-defaults', 'polyglot',
      'withreference', 'waitfor', 'waitforcompletion', 'waitforstart', 'connection-string',
      'service-discovery', 'health-check', 'environment-variable', 'hosting-integration',
      'client-integration', 'the-relationship', 'run-mode', 'publish-mode', 'aspire-dashboard',
      'opentelemetry', 'emulator-pattern', 'existing-resource-pattern',
    ]) expect(anchors).toContain(anchor);
    expect(legacyGroups.map(([id]) => id)).toEqual([
      'core-concepts', 'apis-and-patterns', 'key-terms', 'resource-types', 'execution-modes',
      'dashboard-and-observability', 'common-patterns', 'api-reference-terms',
    ]);
  });

  it('uses optional technical labels and selective plain-language pronunciation', () => {
    for (const term of terms) {
      for (const value of [term.data.termType, term.data.pronunciation]) {
        if (value !== undefined) {
          expect(typeof value).toBe('string');
          expect(value.trim().length).toBeGreaterThan(0);
          expect(value).toBe(value.trim());
        }
      }
    }
    expect(getTerm('apphost').data.termType).toBe('Concept');
    expect(getTerm('waitforcompletion').data.termType).toBe('API method');
    expect(getTerm('iresourceannotation').data.termType).toBe('API interface');
    expect(getTerm('otlp').data.termType).toBe('Protocol');
    expect(getTerm('apphost').data.pronunciation).toBe('app host');
    expect(getTerm('polyglot').data.termType).toBeUndefined();
    expect(getTerm('polyglot').data.pronunciation).toBeUndefined();
  });

  it('links only to existing documentation and explicit heading anchors', () => {
    for (const term of terms) {
      for (const resource of term.data.resources) {
        const [pathname, anchor] = resource.href.split('#');
        expect(pathname, resource.href).toMatch(/^\/.+\/$/);
        const slug = pathname.slice(1, -1);
        const candidates = [`${slug}.mdx`, `${slug}.md`, `${slug}/index.mdx`].map((candidate) =>
          path.join(root, 'src', 'content', 'docs', candidate));
        const destination = candidates.find(existsSync);
        expect(destination, `${term.id}: ${resource.href}`).toBeDefined();
        if (anchor && destination) {
          const headings = [...readFileSync(destination, 'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) =>
            match[1].toLowerCase().replace(/[^\w -]/g, '').replaceAll(' ', '-'));
          expect(headings, resource.href).toContain(anchor);
        }
      }
    }
  });

  it('uses a static compatibility page instead of a fragment-dropping meta redirect', () => {
    const redirects = readFileSync(path.join(root, 'config/redirects.mjs'), 'utf8');
    expect(redirects).not.toContain("'/get-started/glossary/':");
    expect(existsSync(path.join(root, 'src/content/docs/get-started/glossary.mdx'))).toBe(false);
    const compatibilityPage = readFileSync(path.join(root, 'src/pages/get-started/glossary.astro'), 'utf8');
    expect(compatibilityPage).toContain("getCollection('glossary')");
    expect(compatibilityPage).toContain("window.location.search + window.location.hash");
    expect(compatibilityPage).toContain('noindex, follow');
    expect(compatibilityPage).not.toContain('http-equiv="refresh"');
  });

  it('retains the explicit readiness and service-defaults corrections', () => {
    expect(getTerm('withreference').body).toContain('does **not** guarantee startup order or readiness');
    expect(getTerm('waitfor').body).toContain('Without health checks, reaching the running state is sufficient');
    expect(getTerm('service-defaults').body).toContain('not settings automatically applied');
    expect(getTerm('service-defaults').body).toContain('MapDefaultEndpoints');
    expect(getTerm('withannotation').body).toContain('does **not** expose a general `withAnnotation`');
    expect(terms.every((term) => !term.body?.includes('```'))).toBe(true);
  });

  it('defines the approved concepts without inventing legacy anchors', () => {
    for (const id of ['ats', 'endpoint', 'parameter', 'resource-lifetime', 'deployment-pipeline', 'compute-environment', 'otlp', 'resource-command']) {
      expect(getTerm(id)).toBeDefined();
      expect(getTerm(id).data.legacyAnchors).toEqual([]);
    }
    expect(getTerm('apphost').data.aliases).not.toContain('App Host');
    expect(getTerm('apphost').body).toContain('C# or any guest language supported through');
    expect(getTerm('apphost').body).toContain('/dev/glossary/ats/');
    expect(getTerm('opentelemetry').data.aliases).not.toContain('telemetry');
    expect(getTerm('opentelemetry').data.related).toContain('otlp');
  });
});

describe('glossary helpers', () => {
  it('searches titles, aliases, definitions, expanded explanations, and context', () => {
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('apphost')), 'APPHOST')).toBe(true);
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('opentelemetry')), 'otel')).toBe(true);
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('ats')), 'ATS')).toBe(true);
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('otlp')), 'OTLP')).toBe(true);
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('waitfor')), 'health checks')).toBe(true);
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('apphost')), 'postgresql readiness')).toBe(true);
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('withreference')), 'single reference')).toBe(true);
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('apphost')), 'unrelated-word')).toBe(false);
    expect(matchesGlossaryQuery('', '   ')).toBe(true);
  });

  it('sorts without mutating input and generates stable routes', () => {
    const input = [getTerm('waitfor'), getTerm('apphost')];
    expect(sortGlossary(input).map((term) => term.id)).toEqual(['apphost', 'waitfor']);
    expect(input[0].id).toBe('waitfor');
    expect(glossaryLetter('AppHost')).toBe('A');
    expect(glossaryHref('apphost')).toBe('/dev/glossary/apphost/');
  });

  it('searches technical labels and pronunciation without requiring either field', () => {
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('waitforcompletion')), 'API method')).toBe(true);
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('otlp')), 'O-T-L-P')).toBe(true);
    expect(matchesGlossaryQuery(glossarySearchText(getTerm('polyglot')), 'multiple programming languages')).toBe(true);
    expect(glossarySearchText(getTerm('polyglot'))).not.toContain('undefined');
  });

  it('accepts only valid same-origin return links to the glossary', () => {
    expect(glossaryReturnHref('/dev/glossary/?q=wait&letter=W', 'https://aspire.dev')).toBe('/dev/glossary/?q=wait&letter=W');
    for (const input of [null, 'http://[', 'https://example.com/dev/glossary/', '/dev/', 'javascript:alert(1)']) {
      expect(glossaryReturnHref(input, 'https://aspire.dev')).toBeUndefined();
    }
  });

  it('rejects collisions and missing related terms', () => {
    const broken = { ...getTerm('apphost'), id: 'broken', data: { ...getTerm('apphost').data, related: ['missing'] } };
    expect(validateGlossary([getTerm('apphost'), broken])).toEqual(expect.arrayContaining([
      'Duplicate name: AppHost', 'Duplicate anchor: apphost', 'Missing related term: broken → missing',
    ]));
  });
});

describe('glossary component rendering', () => {
  it('renders semantic cards with in-card examples and no-JS context', async () => {
    const html = await renderComponent(GlossaryCard, { props: { term: getTerm('apphost') } });
    expect(html).toContain('href="/dev/glossary/apphost/"');
    expect(html).toContain('id="apphost"');
    expect(html).toContain('data-glossary-context');
    expect(html).toMatch(/<button[^>]+data-glossary-context[^>]+aria-expanded="false"/);
    expect(html).toContain('data-preview="false"');
    expect(html).toContain('data-context-panel');
    expect(html).toContain('aria-hidden="true" inert');
    expect(html).toContain('<noscript>');
    expect(html).toContain('aria-controls="context-apphost"');
    expect(html).toContain('Read the full definition of AppHost');
    expect(html).toContain(getTerm('apphost').data.description);
    expect(html).toContain(getTerm('apphost').data.context);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('role="tooltip"');
  });

  it('renders all terms, labeled filters, letter anchors, counts, and recovery', async () => {
    const html = await renderComponent(GlossaryBrowser, { props: { terms } });
    expect((html.match(/data-glossary-card/g) ?? []).length).toBe(terms.length);
    for (const anchor of terms.flatMap((term) => term.data.legacyAnchors)) {
      expect(html).toContain(`id="${anchor}"`);
    }
    for (const anchor of [...legacyGroups.map(([id]) => id), 'see-also']) {
      expect(html.split(`id="${anchor}"`)).toHaveLength(2);
    }
    expect(html).toContain('id="glossary-search-input"');
    expect(html).toContain('inpage-search-input');
    expect(html).toContain('id="glossary-kind-filters"');
    expect(html).toContain('data-kind="Foundations"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('<select');
    expect(html).toContain('href="#glossary-A"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(`${terms.length} terms`);
    expect(html).toContain('Show all terms');
    expect(html).toContain('<noscript>');
  });

});
