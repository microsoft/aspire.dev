import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import aspireIntegrations from '@data/aspire-integrations.json';
import integrationDocs from '@data/integration-docs.json';

import {
  DEFAULT_NUGET_ICON_URL,
  getOfficialAspireDefaultIconPackages,
  reconcileIntegrationDocs,
  resolveIconUrl,
} from '../../scripts/update-integrations';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(testsDir, '..', '..', 'src', 'content', 'docs');
const communityPackagePrefix = 'CommunityToolkit.Aspire';
const communityMappings = integrationDocs.filter(({ match }) =>
  match.startsWith(communityPackagePrefix)
);

function docsPageExists(
  href: string,
  exists: (candidate: string) => boolean = existsSync
): boolean {
  const slug = href.split(/[?#]/, 1)[0].replace(/^\/|\/$/g, '');
  return ['.md', '.mdx'].some(
    (ext) =>
      exists(path.join(docsRoot, `${slug}${ext}`)) ||
      exists(path.join(docsRoot, slug, `index${ext}`))
  );
}

describe('update-integrations icon handling', () => {
  test('uses the package version for official Aspire packages from nuget.org', () => {
    expect(
      resolveIconUrl({
        id: 'Aspire.Azure.AI.OpenAI',
        version: '13.1.3-preview.1.26166.8',
      })
    ).toBe(
      'https://api.nuget.org/v3-flatcontainer/aspire.azure.ai.openai/13.1.3-preview.1.26166.8/icon'
    );
  });

  test('uses the backfilled nuget.org version for official release feed packages', () => {
    expect(
      resolveIconUrl({
        id: 'Aspire.Hosting.Azure.AppService',
        version: '13.2.0-preview.1.12345.6',
        __iconVersion: '13.1.3-preview.1.26166.8',
      })
    ).toBe(
      'https://api.nuget.org/v3-flatcontainer/aspire.hosting.azure.appservice/13.1.3-preview.1.26166.8/icon'
    );
  });

  test('uses the selected version for Community Toolkit package icons', () => {
    expect(
      resolveIconUrl({
        id: 'CommunityToolkit.Aspire.Hosting.Bun',
        version: '13.3.0',
        iconUrl:
          'https://api.nuget.org/v3-flatcontainer/communitytoolkit.aspire.hosting.bun/13.4.1-beta.686/icon',
      })
    ).toBe(
      'https://api.nuget.org/v3-flatcontainer/communitytoolkit.aspire.hosting.bun/13.3.0/icon'
    );
  });

  test('keeps Community Toolkit catalog icons aligned with package versions', () => {
    const mismatches = aspireIntegrations
      .filter(({ title }) => title.startsWith(communityPackagePrefix))
      .filter(
        ({ icon, version }) =>
          version != null && !icon.toLowerCase().endsWith(`/${version.toLowerCase()}/icon`)
      )
      .map(({ title, version }) => `${title}@${version}`);

    expect(mismatches).toEqual([]);
  });

  test('reports default icons for official Aspire packages without throwing', () => {
    expect(
      getOfficialAspireDefaultIconPackages([
        {
          title: 'Aspire.Azure.AI.OpenAI',
          icon: DEFAULT_NUGET_ICON_URL,
          href: 'https://www.nuget.org/packages/Aspire.Azure.AI.OpenAI',
          tags: [],
          version: '13.1.3-preview.1.26166.8',
        },
      ])
    ).toEqual(['Aspire.Azure.AI.OpenAI@13.1.3-preview.1.26166.8']);
  });

  test('allows default icons for community packages', () => {
    expect(
      getOfficialAspireDefaultIconPackages([
        {
          title: 'CommunityToolkit.Aspire.Hosting.Azure.Dapr',
          icon: DEFAULT_NUGET_ICON_URL,
          href: 'https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.Azure.Dapr',
          tags: [],
        },
      ])
    ).toEqual([]);
  });
});

describe('integration documentation reconciliation', () => {
  const official = {
    match: 'Aspire.Hosting.Redis',
    href: '/integrations/caching/redis/redis-get-started/',
  };
  const community = {
    match: 'CommunityToolkit.Aspire.Hosting.Dapr',
    href: '/integrations/compute/dapr/',
  };
  const thirdParty = {
    match: 'Particular.Aspire.Hosting.ServicePlatform',
    href: 'https://docs.particular.net/platform/aspire/',
  };
  const catalog = [official, community].map(({ match }) => ({ title: match }));

  test('leaves the current documentation mappings unchanged', () => {
    expect(reconcileIntegrationDocs(integrationDocs, aspireIntegrations)).toEqual(
      integrationDocs
    );
  });

  test.each(['Aspire.Hosting.Removed', 'CommunityToolkit.Aspire.Hosting.Bun'])(
    'removes the stale mapping for %s without changing surviving links or order',
    (match) => {
      const docs = [official, { match, href: '/retired/' }, community, thirdParty];

      expect(reconcileIntegrationDocs(docs, catalog)).toEqual([
        official,
        community,
        thirdParty,
      ]);
      expect(docs).toHaveLength(4);
    }
  );

  test('matches catalog package IDs case-insensitively', () => {
    const docs = [official, community];
    const lowercaseCatalog = catalog.map(({ title }) => ({ title: title.toLowerCase() }));

    expect(reconcileIntegrationDocs(docs, lowercaseCatalog)).toEqual(docs);
  });

  test('preserves third-party mappings outside the managed catalog', () => {
    expect(reconcileIntegrationDocs([thirdParty], [])).toEqual([thirdParty]);
  });

  test('does not invent documentation links for newly discovered packages', () => {
    expect(
      reconcileIntegrationDocs([official], [
        ...catalog,
        { title: 'Aspire.Hosting.NewIntegration' },
      ])
    ).toEqual([official]);
  });
});

describe('integration update automation', () => {
  const frontendRoot = path.resolve(testsDir, '..', '..');
  const script = readFileSync(
    path.join(frontendRoot, 'scripts', 'update-integration-data.ps1'),
    'utf8'
  );
  const workflow = readFileSync(
    path.resolve(frontendRoot, '..', '..', '.github', 'workflows', 'update-integration-data.yml'),
    'utf8'
  );

  test('allows and stages reconciled documentation mappings', () => {
    const allowedPaths = script.match(/\$AllowedPaths = @\(([\s\S]*?)\)/)?.[1];
    const stagedPaths = workflow.match(/git add -- \\[\s\S]*?\r?\n\r?\n/)?.[0];

    expect(allowedPaths).toContain("'src/frontend/src/data/integration-docs.json'");
    expect(stagedPaths).toContain('src/frontend/src/data/integration-docs.json');
  });

  test('validates updated mappings before checking for changes or regenerating APIs', () => {
    const validationIndex = script.indexOf('& pnpm run test:unit:structured-data');

    expect(validationIndex).toBeGreaterThan(script.indexOf('& pnpm run update:all'));
    expect(validationIndex).toBeLessThan(script.indexOf('if (-not $anyChanges)'));
    expect(script.slice(validationIndex)).toMatch(
      /test:unit:structured-data\s+if \(\$LASTEXITCODE -ne 0\) \{[^}]*exit 1/
    );
  });
});

describe('Community Toolkit documentation mappings', () => {
  test('maps each package at most once', () => {
    const seen = new Set<string>();
    const duplicates = communityMappings
      .map(({ match }) => match)
      .filter((match) => {
        if (seen.has(match)) {
          return true;
        }
        seen.add(match);
        return false;
      });

    expect(duplicates).toEqual([]);
  });

  test('only maps packages in the current integration catalog', () => {
    const catalogPackages = new Set(aspireIntegrations.map(({ title }) => title));
    const staleMappings = communityMappings
      .map(({ match }) => match)
      .filter((match) => !catalogPackages.has(match));

    expect(staleMappings).toEqual([]);
  });

  test('uses trailing-slash links to existing documentation pages', () => {
    const invalidDestinations = communityMappings
      .filter(({ href }) => href.startsWith('/'))
      .filter(({ href }) => !href.endsWith('/') || !docsPageExists(href))
      .map(({ match, href }) => `${match}: ${href}`);

    expect(invalidDestinations).toEqual([]);
  });
});

describe('docsPageExists markdown resolution', () => {
  // The mapping guardrail resolves each documentation destination to an
  // on-disk page. Markdown pages can be authored as either `.md` or `.mdx`
  // and as either a flat file or a directory `index` file, so all four
  // combinations must resolve. Real mappings are currently all `.mdx`, so
  // these focused cases guard the `.md`/`index.md` support (PR #1372 review)
  // against regression even though no live mapping exercises it yet.
  const href = '/integrations/frameworks/example/';
  const slug = 'integrations/frameworks/example';

  test.each([
    ['flat .md', path.join(docsRoot, `${slug}.md`)],
    ['index .md', path.join(docsRoot, slug, 'index.md')],
    ['flat .mdx', path.join(docsRoot, `${slug}.mdx`)],
    ['index .mdx', path.join(docsRoot, slug, 'index.mdx')],
  ])('recognizes a %s documentation page', (_label, target) => {
    expect(docsPageExists(href, (candidate) => candidate === target)).toBe(true);
  });

  test('returns false when no markdown or MDX page matches', () => {
    expect(docsPageExists(href, () => false)).toBe(false);
  });

  test('strips query strings and hashes before resolving the slug', () => {
    const target = path.join(docsRoot, `${slug}.md`);
    expect(docsPageExists(`${href}?tab=host#usage`, (candidate) => candidate === target)).toBe(
      true
    );
  });
});
