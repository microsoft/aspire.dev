import { describe, expect, test } from 'vitest';

import samples from '@data/samples.json';

import { type SampleResult, normalizeSampleTerminology } from '../../scripts/update-samples';

describe('sample terminology normalization', () => {
  test('normalizes every generated text field', () => {
    const sample: SampleResult = {
      name: 'terminology-sample',
      title: '.NET Aspire app host sample',
      description: 'A .NET Aspire App Host project.',
      href: 'https://github.com/microsoft/aspire-samples/tree/main/samples/terminology-sample',
      readme: '# .NET Aspire sample\n\nRun the app host.',
      readmeRaw: '# .NET Aspire sample\n\nRun the APP HOST.',
      tags: ['csharp'],
      thumbnail: null,
      appHost: 'csproj',
      appHostPath: 'Terminology.AppHost/AppHost.cs',
      appHostCode: '// Keep the container running between app host sessions.',
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
    const deprecatedTerminology = /\.NET Aspire|\bapp host\b/i;
    const violations = samples.flatMap((sample) =>
      textFields
        .filter((field) => deprecatedTerminology.test(sample[field] ?? ''))
        .map((field) => `${sample.name}.${field}`)
    );

    expect(violations).toEqual([]);
  });
});
