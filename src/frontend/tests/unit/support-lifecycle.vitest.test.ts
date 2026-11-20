import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildSupportOgDetails,
  parseSupportLifecycle,
  type SupportLifecycle,
} from '../../src/utils/support-lifecycle';

const supportPage = readFileSync(
  new URL('../../src/content/docs/support.mdx', import.meta.url),
  'utf8'
);

const FIXTURE = `
<Badge text="📆 Last updated: October 7, 2026" variant="tip" size="large" />

## Release cadence

### Supported versions

| Version     | Original release date | Latest patch version | Patch release date | End of support                               |
| ----------- | --------------------- | -------------------- | ------------------ | -------------------------------------------- |
| Aspire 13.6 | September 29, 2026    | 13.6.1               | October 7, 2026    | When next major or minor version is released. |

### Out of support versions

| Version     | Original release date | Latest patch version | Patch release date | End of support     |
| ----------- | --------------------- | -------------------- | ------------------ | ------------------ |
| Aspire 13.5 | August 18, 2026       | 13.5.4               | September 15, 2026 | September 29, 2026 |
| Aspire 13.4 | June 1, 2026          | 13.4.6               | June 20, 2026      | August 18, 2026    |

## Versioning and support

| Unrelated | Table |
| --------- | ----- |
| Aspire 1.0 | ignored |
`;

describe('parseSupportLifecycle', () => {
  it('reads the supported and out-of-support release tables', () => {
    const lifecycle = parseSupportLifecycle(FIXTURE);

    expect(lifecycle.supported).toEqual([
      {
        version: 'Aspire 13.6',
        releaseDate: 'September 29, 2026',
        latestPatch: '13.6.1',
        patchDate: 'October 7, 2026',
        endOfSupport: 'When next major or minor version is released.',
      },
    ]);
    expect(lifecycle.outOfSupport.map(({ version }) => version)).toEqual([
      'Aspire 13.5',
      'Aspire 13.4',
    ]);
    expect(lifecycle.outOfSupport[0]).toMatchObject({
      latestPatch: '13.5.4',
      endOfSupport: 'September 29, 2026',
    });
  });

  it('reads the last updated date from the badge', () => {
    expect(parseSupportLifecycle(FIXTURE).lastUpdated).toBe('October 7, 2026');
  });

  it('handles Windows line endings', () => {
    const lifecycle = parseSupportLifecycle(FIXTURE.replace(/\n/g, '\r\n'));

    expect(lifecycle.supported).toHaveLength(1);
    expect(lifecycle.outOfSupport).toHaveLength(2);
  });

  it('maps columns by header name so reordering or extra columns are safe', () => {
    const lifecycle = parseSupportLifecycle(`
### Supported versions

| Notes | Latest patch version | Version | Original release date |
| ----- | -------------------- | ------- | --------------------- |
| LTS   | 14.0.2               | Aspire 14.0 | January 5, 2027   |
`);

    expect(lifecycle.supported).toEqual([
      {
        version: 'Aspire 14.0',
        releaseDate: 'January 5, 2027',
        latestPatch: '14.0.2',
        patchDate: '',
        endOfSupport: '',
      },
    ]);
  });

  it('strips markdown links and emphasis from cells', () => {
    const lifecycle = parseSupportLifecycle(`
### Supported versions

| Version | Latest patch version |
| ------- | -------------------- |
| **Aspire 13.6** | [\`13.6.1\`](https://example.com/releases/13.6.1) |
`);

    expect(lifecycle.supported[0]).toMatchObject({
      version: 'Aspire 13.6',
      latestPatch: '13.6.1',
    });
  });

  it('returns empty results instead of throwing when the page has no tables', () => {
    expect(parseSupportLifecycle('## Nothing here')).toEqual({
      lastUpdated: undefined,
      supported: [],
      outOfSupport: [],
    });
  });
});

describe('buildSupportOgDetails', () => {
  it('summarizes the supported release, latest patch, and key dates', () => {
    expect(buildSupportOgDetails(parseSupportLifecycle(FIXTURE))).toEqual([
      { label: 'Supported', value: 'Aspire 13.6 · released September 29, 2026' },
      { label: 'Latest patch', value: '13.6.1 · October 7, 2026' },
      { label: 'Support ends', value: 'When next major or minor version is released' },
      { label: 'Out of support', value: 'Aspire 13.5 and earlier' },
      { label: 'Last updated', value: 'October 7, 2026' },
    ]);
  });

  it('drops rows whose source data is missing instead of rendering them empty', () => {
    const lifecycle: SupportLifecycle = {
      supported: [
        {
          version: 'Aspire 13.6',
          releaseDate: '',
          latestPatch: '',
          patchDate: '',
          endOfSupport: '',
        },
      ],
      outOfSupport: [],
    };

    expect(buildSupportOgDetails(lifecycle)).toEqual([
      { label: 'Supported', value: 'Aspire 13.6' },
    ]);
  });
});

describe('support page social card', () => {
  const lifecycle = parseSupportLifecycle(supportPage);

  it('can be built from the real support.mdx tables', () => {
    expect(
      lifecycle.supported.length,
      'support.mdx should list a supported release'
    ).toBeGreaterThan(0);
    expect(Object.values(lifecycle.supported[0])).not.toContain('');
    expect(lifecycle.outOfSupport[0]?.version).toMatch(/^Aspire \d/);
    expect(lifecycle.lastUpdated).toBeTruthy();

    expect(buildSupportOgDetails(lifecycle).map(({ label }) => label)).toEqual([
      'Supported',
      'Latest patch',
      'Support ends',
      'Out of support',
      'Last updated',
    ]);
  });

  it('points the page at the data-driven card instead of the generic fallback', () => {
    expect(supportPage).toMatch(/^ogImage: \/og\/support\.png$/m);
  });
});
