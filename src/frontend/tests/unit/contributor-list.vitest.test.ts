import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ContributorList from '@components/ContributorList.astro';
import { contributorCacheIntegration } from '../../src/utils/contributors';
import en from '../../src/content/i18n/en.json';
import { renderComponent } from './astro-test-utils';

function lifecycle(name: 'astro:build:start' | 'astro:build:done') {
  const hook = contributorCacheIntegration().hooks[name];
  if (hook) Reflect.apply(hook, undefined, [{}]);
}

beforeEach(() => {
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
    vi.stubEnv(name, '');
  }
  lifecycle('astro:build:start');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  lifecycle('astro:build:done');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('renders ordered, overlapping, lazy avatars as keyboard-accessible GitHub links', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
    { id: 2, login: 'grace' },
    { id: 1, login: 'ada' },
  ])));
  vi.stubGlobal('fetch', fetchMock);
  const html = await renderComponent(ContributorList, {
    props: { githubRepo: 'microsoft/aspire', focusColor: '#663399' },
  });
  expect(html).toMatch(/class="avatar-list(?:\s|")/);
  expect(html).toContain('--avatar-focus-color:#663399');
  expect(html).toContain('href="https://github.com/grace"');
  expect(html).toContain('href="https://github.com/ada"');
  expect(html.indexOf('alt="grace"')).toBeLessThan(html.indexOf('alt="ada"'));
  expect(html).toContain('src="https://avatars.githubusercontent.com/u/2?s=64"');
  expect(html).toContain('alt="grace" title="grace" width="48" height="48"');
  expect(html.match(/loading="lazy"/g)).toHaveLength(2);
  expect(html).not.toContain('tabindex="-1"');
  expect(html).not.toContain('contributors-unavailable');
});

it('retains wrapped 3rem avatars, overlap, forced-color boundaries, and visible keyboard focus', () => {
  const source = readFileSync(new URL('../../src/components/ContributorList.astro', import.meta.url), 'utf8');
  expect(source).toContain('--avatar-size: 3rem');
  expect(source).toContain('--avatar-overlap: -0.125em');
  expect(source).toContain('flex-wrap: wrap');
  expect(source).toContain('border-radius: 50%');
  expect(source).toContain('outline: 1px solid transparent');
  expect(source).toContain('.avatar-list li:has(:focus-visible)');
  expect(source).toContain('transform: scale(1.1)');
  expect(source).toMatch(/\.avatar-list a:focus-visible\s*\{\s*outline: 2px solid var\(--local-accent\)/);
});

it('shares the loader across actual concurrent and sequential component renders without sharing filters', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
    { id: 1, login: 'ada' },
    { id: 2, login: 'grace' },
    { id: 3, login: 'github-actions[bot]' },
  ])));
  vi.stubGlobal('fetch', fetchMock);
  const [first, second] = await Promise.all([
    renderComponent(ContributorList, { props: { githubRepo: 'microsoft/aspire', ignore: ['ada', 'github-actions[bot]'] } }),
    renderComponent(ContributorList, { props: { githubRepo: 'Microsoft/Aspire', ignore: ['grace'] } }),
  ]);
  const third = await renderComponent(ContributorList, { props: { githubRepo: 'microsoft/aspire' } });
  expect(first).not.toContain('alt="ada"');
  expect(first).not.toContain('alt="github-actions[bot]"');
  expect(first).toContain('alt="grace"');
  expect(second).toContain('alt="ada"');
  expect(second).not.toContain('alt="grace"');
  expect(third).toContain('alt="ada"');
  expect(third).toContain('alt="grace"');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('renders a visible translated unavailable message and repository contributor link', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
  const translations: Record<string, string> = {
    'contributors.unavailable': en.contributors.unavailable,
    'contributors.viewOnGitHub': en.contributors.viewOnGitHub,
  };
  const t = Object.assign((key: string) => translations[key] ?? key, { dir: () => 'ltr' as const });
  const html = await renderComponent(ContributorList, {
    props: { githubRepo: 'microsoft/aspire' },
    locals: { t },
  });
  expect(html).toContain(en.contributors.unavailable);
  expect(html).toContain(en.contributors.viewOnGitHub);
  expect(html).toContain('href="https://github.com/microsoft/aspire/graphs/contributors"');
  expect(html).not.toContain('avatar-list');
  expect(html).not.toContain('<img');
});

it('does not show the unavailable message for a legitimate empty list', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')));
  const html = await renderComponent(ContributorList, { props: { githubRepo: 'microsoft/aspire' } });
  expect(html).toContain('avatar-list');
  expect(html).not.toContain('contributors-unavailable');
  expect(console.warn).not.toHaveBeenCalled();
});
