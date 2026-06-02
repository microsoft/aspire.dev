import { describe, expect, it } from 'vitest';

import {
  collectSampleReadmeHeadings,
  slugifyHeading,
  stripReadmeTitle,
  toSentenceCase,
} from '@utils/sample-readme-headings';

describe('stripReadmeTitle', () => {
  it('drops the leading h1 line', () => {
    const readme = '# Redis sample\n\nThis sample shows...\n## Prerequisites\n';
    expect(stripReadmeTitle(readme)).toBe('This sample shows...\n## Prerequisites\n');
  });

  it('returns the input unchanged when there is no leading h1', () => {
    const readme = 'No title here\n\n## Heading';
    expect(stripReadmeTitle(readme)).toBe(readme);
  });
});

describe('slugifyHeading', () => {
  it('lowercases and kebab-cases the input', () => {
    expect(slugifyHeading('Running the App')).toBe('running-the-app');
  });

  it('strips punctuation while preserving hyphens', () => {
    expect(slugifyHeading('AppHost: deep-dive!')).toBe('apphost-deep-dive');
  });

  it('returns "section" for collapsed inputs', () => {
    expect(slugifyHeading('???')).toBe('section');
  });
});

describe('toSentenceCase', () => {
  it('capitalises the first word and lowercases the rest', () => {
    expect(toSentenceCase('Running the App')).toBe('Running the app');
  });

  it('preserves tokens containing technical punctuation (filenames, namespaces)', () => {
    expect(toSentenceCase('Configure the AppHost.cs File')).toBe(
      'Configure the AppHost.cs file'
    );
  });

  it('preserves tokens containing digits (version numbers, etc.)', () => {
    // Version-number-shaped tokens stay intact; surrounding plain words
    // still get sentence-cased.
    expect(toSentenceCase('Use version 13.4 features')).toBe('Use version 13.4 features');
  });
});

describe('collectSampleReadmeHeadings', () => {
  it('returns only headings within the configured depth range', () => {
    const readme = [
      '# Title to strip',
      '',
      'Intro paragraph.',
      '',
      '## Prerequisites',
      '',
      'Some text.',
      '',
      '### Setting up the SDK',
      '',
      '#### Skipped because it is too deep',
      '',
      '## Running the App',
    ].join('\n');

    expect(collectSampleReadmeHeadings(readme)).toEqual([
      { depth: 2, slug: 'prerequisites', text: 'Prerequisites' },
      { depth: 3, slug: 'setting-up-the-sdk', text: 'Setting up the SDK' },
      { depth: 2, slug: 'running-the-app', text: 'Running the app' },
    ]);
  });

  it('returns an empty array when the README has no headings in range', () => {
    const readme = '# Title only\n\nNo subheadings in this sample.\n';
    expect(collectSampleReadmeHeadings(readme)).toEqual([]);
  });

  it('matches the rendered slug suffix for duplicate headings', () => {
    // SampleReadmeBlocks counts duplicates across all rendered headings;
    // the second occurrence of `Setup` must surface as `setup-1` so anchor
    // links resolve to the second rendered <h2>.
    const readme = ['## Setup', '', 'First section.', '', '## Setup', '', 'Second section.'].join(
      '\n'
    );

    expect(collectSampleReadmeHeadings(readme)).toEqual([
      { depth: 2, slug: 'setup', text: 'Setup' },
      { depth: 2, slug: 'setup-1', text: 'Setup' },
    ]);
  });

  it('keeps the duplicate counter in sync when out-of-range headings collide with TOC headings', () => {
    // The counter has to advance for every heading regardless of depth so
    // a later in-range duplicate gets the suffix the renderer assigns. An
    // h4 named "Setup" before an h2 "Setup" pushes the h2 to `setup-1`.
    const readme = [
      '#### Setup',
      '',
      'Pre-step.',
      '',
      '## Setup',
      '',
      'Main section.',
    ].join('\n');

    expect(collectSampleReadmeHeadings(readme)).toEqual([
      { depth: 2, slug: 'setup-1', text: 'Setup' },
    ]);
  });

  it('honours custom min/max heading levels', () => {
    const readme = ['## H2', '', '### H3', '', '#### H4'].join('\n');
    expect(
      collectSampleReadmeHeadings(readme, { minHeadingLevel: 3, maxHeadingLevel: 4 })
    ).toEqual([
      { depth: 3, slug: 'h3', text: 'H3' },
      { depth: 4, slug: 'h4', text: 'H4' },
    ]);
  });
});
