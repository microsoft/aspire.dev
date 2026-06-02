import { describe, expect, it } from 'vitest';

import {
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
