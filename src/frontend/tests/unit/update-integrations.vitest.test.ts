import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import aspireIntegrations from '@data/aspire-integrations.json';
import integrationDocs from '@data/integration-docs.json';

import {
  DEFAULT_NUGET_ICON_URL,
  ASPIRE_RELEASE_ICON_URL,
  getOfficialAspireDefaultIconPackages,
  reconcileIntegrationDocs,
  reconcileReleaseBranchCatalog,
  resolveIconUrl,
  selectPreferredPackageVersion,
} from '../../scripts/update-integrations';
import { getPinnedReleaseVersion } from '../../scripts/aspire-package-source';

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

describe('integration catalog integrity', () => {
  test('contains each NuGet package ID only once, ignoring case', () => {
    const packageIds = aspireIntegrations.map(({ title }) => title.toLowerCase());
    const duplicateIds = packageIds.filter((id, index) => packageIds.indexOf(id) !== index);

    expect(duplicateIds).toEqual([]);
  });
});

describe('release package version pinning', () => {
  const pin = '13.6.0-preview.1.26473.12';
  const leaf = (version: string) => ({
    version,
    isPrerelease: version.includes('-'),
    listed: true,
    deprecated: false,
  });
  const mixedFeed = [leaf('13.5.4'), leaf(pin), leaf('14.0.0-preview.1.26473.11')];

  test('selects the exact release build instead of stable or next-release packages', () => {
    expect(selectPreferredPackageVersion(mixedFeed, pin)).toBe(pin);
  });

  describe('release catalog reconciliation', () => {
    const entry = (title: string, version: string) => ({
      title,
      version,
      icon: resolveIconUrl({ id: title, version }),
      href: `https://www.nuget.org/packages/${title}`,
      tags: [],
    });

    test('refreshes Toolkit icons with their selected package version', () => {
      const title = 'CommunityToolkit.Aspire.Hosting.Kind';
      const fresh = entry(title, '13.5.1-beta.767');
      expect(
        reconcileReleaseBranchCatalog([fresh], new Set([title.toLowerCase()]), [
          entry(title, '13.5.0'),
        ])[0].icon
      ).toBe(fresh.icon);
    });

    test('retains published official icons when ingesting a release build', () => {
      const title = 'Aspire.Hosting.Redis';
      const previous = entry(title, '13.5.4');
      const fresh = entry(title, '13.6.0-preview.1.26473.12');
      expect(
        reconcileReleaseBranchCatalog([fresh], new Set([title.toLowerCase()]), [previous])[0].icon
      ).toBe(previous.icon);
    });

    test('can repair metadata when rerunning the same release build', () => {
      const previous = entry('Aspire.Hosting.Java', '13.6.0-preview.1');
      const fresh = { ...previous, icon: 'https://example.com/release-icon.png' };
      expect(
        reconcileReleaseBranchCatalog([fresh], new Set([previous.title.toLowerCase()]), [
          previous,
        ])[0].icon
      ).toBe(fresh.icon);
    });

    test('retains absent packages but does not reintroduce filtered fetched packages', () => {
      const absent = entry('Aspire.Hosting.Independent', '1.0.0');
      const excluded = entry('Aspire.Hosting.Deprecated', '13.5.0');
      expect(
        reconcileReleaseBranchCatalog([], new Set([excluded.title.toLowerCase()]), [
          absent,
          excluded,
        ])
      ).toEqual([absent]);
    });
  });

  test('keeps stable-first selection when no pin applies, including Toolkit packages', () => {
    expect(selectPreferredPackageVersion(mixedFeed)).toBe('13.5.4');
    expect(selectPreferredPackageVersion([leaf(pin), leaf('14.0.0-preview.1')])).toBe(
      '14.0.0-preview.1'
    );
  });

  test('does not substitute another version when the requested build is absent', () => {
    expect(selectPreferredPackageVersion([leaf('14.0.0-preview.1')], pin)).toBeNull();
    expect(selectPreferredPackageVersion([], pin)).toBeNull();
  });

  test.each([{ listed: false }, { deprecated: true }])(
    'rejects unavailable pinned versions: %j',
    (overrides) => {
      expect(() => selectPreferredPackageVersion([{ ...leaf(pin), ...overrides }], pin)).toThrow(
        'unlisted or deprecated'
      );
    }
  );

  test('does not fall back to preview when all stable versions are deprecated', () => {
    expect(
      selectPreferredPackageVersion([{ ...leaf('13.5.4'), deprecated: true }, leaf(pin)])
    ).toBeNull();
  });

  test('trims the pin and scopes it to the matching release branch', () => {
    expect(getPinnedReleaseVersion('release/13.6', ` ${pin} `)).toBe(pin);
    expect(getPinnedReleaseVersion('main', pin)).toBeUndefined();
    expect(getPinnedReleaseVersion('feature/docs', pin)).toBeUndefined();
    expect(getPinnedReleaseVersion('release/13.6', '')).toBeUndefined();
  });

  test.each(['14.0.0-preview.1', '13.6.*', 'latest', '13.6'])(
    'rejects an invalid or mismatched release pin: %s',
    (version) => {
      expect(() => getPinnedReleaseVersion('release/13.6', version)).toThrow(
        'must be an exact package version'
      );
    }
  );
});

describe('update-integrations icon handling', () => {
  test('uses public branding instead of a release-feed icon that may require authentication', () => {
    const icon =
      'https://pkgs.dev.azure.com/dnceng/public/_packaging/release/nuget/v3/flat2/aspire.hosting.java/13.6.0-preview.1/aspire.hosting.java.13.6.0-preview.1.nupkg?extract=Icon.png';
    expect(
      resolveIconUrl({
        id: 'Aspire.Hosting.Java',
        version: '13.6.0-preview.1',
        iconUrl: icon,
        __trustedSource: true,
      })
    ).toBe(ASPIRE_RELEASE_ICON_URL);
  });

  test('uses public branding instead of inventing an unpublished nuget.org icon URL', () => {
    expect(
      resolveIconUrl({
        id: 'Aspire.Hosting.Java',
        version: '13.6.0-preview.1',
        __trustedSource: true,
      })
    ).toBe(ASPIRE_RELEASE_ICON_URL);
  });

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
    expect(reconcileIntegrationDocs(integrationDocs, aspireIntegrations)).toEqual(integrationDocs);
  });

  test.each(['Aspire.Hosting.Removed', 'CommunityToolkit.Aspire.Hosting.Bun'])(
    'removes the stale mapping for %s without changing surviving links or order',
    (match) => {
      const docs = [official, { match, href: '/retired/' }, community, thirdParty];

      expect(reconcileIntegrationDocs(docs, catalog)).toEqual([official, community, thirdParty]);
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
      reconcileIntegrationDocs([official], [...catalog, { title: 'Aspire.Hosting.NewIntegration' }])
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

test('AWS package documentation points to the first-party overview', () => {
  const mapping = integrationDocs.find(({ match }) => match === 'Aspire.Hosting.AWS');
  expect(mapping?.href).toBe('/integrations/cloud/aws/overview/');
  expect(docsPageExists(mapping!.href)).toBe(true);
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
