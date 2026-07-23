import { describe, expect, test } from 'vitest';

import samples from '@data/samples.json';

import { normalizeAspireTerminology } from '../../scripts/aspire-terminology';
import { type SampleResult, normalizeSampleTerminology } from '../../scripts/update-samples';

const legacyAspireName = ['.NET', 'Aspire'].join(' ');
const legacyAppHostName = ['app', 'host'].join(' ');

describe('Aspire terminology normalization', () => {
  test.each([
    ['uppercase article', `A ${legacyAspireName} project`, 'An Aspire project'],
    ['lowercase article', `Build a ${legacyAspireName} project`, 'Build an Aspire project'],
    [
      'extra horizontal whitespace',
      `A   ${['.NET', 'Aspire'].join('\t')} project`,
      'An Aspire project',
    ],
  ])('uses one space for the %s case', (_scenario, input, expected) => {
    expect(normalizeAspireTerminology(input)).toBe(expected);
  });
});

describe('sample terminology normalization', () => {
  test('normalizes every generated text field', () => {
    const sample: SampleResult = {
      name: 'terminology-sample',
      title: `${legacyAspireName} ${legacyAppHostName} sample`,
      description: `A ${legacyAspireName} ${legacyAppHostName} project.`,
      href: 'https://github.com/microsoft/aspire-samples/tree/main/samples/terminology-sample',
      readme: `# ${legacyAspireName} sample\n\nRun the ${legacyAppHostName}.`,
      readmeRaw: `# ${legacyAspireName} sample\n\nRun the ${legacyAppHostName.toUpperCase()}.`,
      tags: ['csharp'],
      thumbnail: null,
      appHost: 'csproj',
      appHostPath: 'Terminology.AppHost/AppHost.cs',
      appHostCode: `// Keep the container running between ${legacyAppHostName} sessions.`,
    };

    expect(normalizeSampleTerminology(sample)).toEqual({
      ...sample,
      title: 'Aspire AppHost sample',
      description: 'An Aspire AppHost project.',
      readme: '# Aspire sample\n\nRun the AppHost.',
      readmeRaw: '# Aspire sample\n\nRun the AppHost.',
      appHostCode: '// Keep the container running between AppHost sessions.',
    });
  });

  test('does not rewrite related words that are not deprecated terms', () => {
    const sample: SampleResult = {
      name: 'hosting-sample',
      title: 'App hosting sample',
      description: null,
      href: 'https://github.com/microsoft/aspire-samples/tree/main/samples/hosting-sample',
      readme: 'This sample demonstrates app hosting.',
      readmeRaw: 'This sample demonstrates app hosting.',
      tags: [],
      thumbnail: null,
      appHost: null,
      appHostPath: null,
      appHostCode: null,
    };

    expect(normalizeSampleTerminology(sample)).toEqual(sample);
  });

  test('keeps generated sample data free of deprecated terminology', () => {
    const textFields = ['title', 'description', 'readme', 'readmeRaw', 'appHostCode'] as const;
    const deprecatedTerminology = new RegExp(
      [legacyAspireName, legacyAppHostName]
        .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|'),
      'i'
    );
    const violations = samples.flatMap((sample) =>
      textFields
        .filter((field) => deprecatedTerminology.test(sample[field] ?? ''))
        .map((field) => `${sample.name}.${field}`)
    );

    expect(violations).toEqual([]);
  });
});
