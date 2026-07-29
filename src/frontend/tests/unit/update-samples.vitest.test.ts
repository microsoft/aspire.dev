import { describe, expect, test } from 'vitest';

import samples from '@data/samples.json';

import {
  normalizeAspireTerminology,
  normalizeAspireTerminologyInCode,
} from '../../scripts/aspire-terminology';
import { type SampleResult, normalizeSampleTerminology } from '../../scripts/update-samples';

const legacyAspireName = ['.NET', 'Aspire'].join(' ');
const legacyDotnetAspireName = ['dotnet', 'aspire'].join(' ');
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

  test.each([
    ['bold wrapper', `A **${legacyAspireName}** project`, 'An **Aspire** project'],
    [
      'inline link',
      `This is a [${legacyAspireName}](https://aspire.dev/) sample`,
      'This is an [Aspire](https://aspire.dev/) sample',
    ],
    ['underscore emphasis', `A _${legacyAspireName}_ project`, 'An _Aspire_ project'],
  ])('corrects the article across a %s', (_scenario, input, expected) => {
    expect(normalizeAspireTerminology(input)).toBe(expected);
  });

  test.each([
    ['a prefixed framework token', `ASP${legacyAspireName} guidance`],
    ['a dotted namespace', `Ship Microsoft${legacyAspireName} today`],
    ['a suffixed token', `${legacyAspireName}Server guidance`],
    ['a suffixed token after an article', `A ${legacyAspireName}Server sample`],
  ])('leaves %s untouched', (_scenario, input) => {
    expect(normalizeAspireTerminology(input)).toBe(input);
  });

  test.each([
    ['uppercase article', `A ${legacyDotnetAspireName} sample`, 'An Aspire sample'],
    ['lowercase article', `Build a ${legacyDotnetAspireName} sample`, 'Build an Aspire sample'],
    ['no article', `Deploy the ${legacyDotnetAspireName} app`, 'Deploy the Aspire app'],
  ])('normalizes the "dotnet aspire" spelling (%s)', (_scenario, input, expected) => {
    expect(normalizeAspireTerminology(input)).toBe(expected);
  });

  test.each([
    ['a fenced block', '```bash\n' + `${legacyDotnetAspireName} run` + '\n```'],
    ['an inline code command', `Run \`${legacyDotnetAspireName} run\` to start.`],
    ['a fenced legacy brand', '```\n' + legacyAspireName + '\n```'],
  ])('preserves %s so sample commands stay runnable', (_scenario, input) => {
    expect(normalizeAspireTerminology(input)).toBe(input);
  });

  test('normalizes prose while preserving adjacent code', () => {
    const input = `Build a ${legacyAspireName} app, then run \`${legacyDotnetAspireName} run\`.`;
    expect(normalizeAspireTerminology(input)).toBe(
      'Build an Aspire app, then run `dotnet aspire run`.'
    );
  });

  test.each([
    ['prose', `A ${legacyAspireName} ${legacyAppHostName} sample`],
    ['mixed prose and code', `Run \`${legacyDotnetAspireName} run\` in a ${legacyAspireName} app`],
  ])('is idempotent for %s', (_scenario, input) => {
    const once = normalizeAspireTerminology(input);
    expect(normalizeAspireTerminology(once)).toBe(once);
  });

  test('passes null and undefined through unchanged', () => {
    expect(normalizeAspireTerminology(null)).toBeNull();
    expect(normalizeAspireTerminology(undefined)).toBeUndefined();
  });
});

describe('Aspire terminology normalization in code', () => {
  test.each([
    [
      'a line comment',
      `// Keep the container running between ${legacyAppHostName} sessions.`,
      '// Keep the container running between AppHost sessions.',
    ],
    [
      'a trailing comment after code',
      `builder.Build().Run(); // starts the ${legacyAppHostName}`,
      'builder.Build().Run(); // starts the AppHost',
    ],
    [
      'a block comment with an article',
      `/* A ${legacyAspireName} ${legacyAppHostName}. */`,
      '/* An Aspire AppHost. */',
    ],
  ])('normalizes deprecated terms inside %s', (_scenario, input, expected) => {
    expect(normalizeAspireTerminologyInCode(input)).toBe(expected);
  });

  test.each([
    ['a double-quoted string literal', `var cmd = "${legacyDotnetAspireName} run";`],
    ['a C# verbatim string', `var path = @"C:\\${legacyAppHostName}\\bin";`],
    ['a TS template literal', `const label = \`the ${legacyAppHostName} process\`;`],
    ['a bare identifier expression', 'var appHost = builder.Build();'],
  ])('preserves %s so the code still compiles', (_scenario, input) => {
    expect(normalizeAspireTerminologyInCode(input)).toBe(input);
  });

  test('rewrites comments while preserving an adjacent string literal', () => {
    const input =
      `// Launch the ${legacyAppHostName}.\n` +
      `builder.AddExecutable("cli", "${legacyDotnetAspireName}");`;
    expect(normalizeAspireTerminologyInCode(input)).toBe(
      '// Launch the AppHost.\n' + `builder.AddExecutable("cli", "${legacyDotnetAspireName}");`
    );
  });

  test('leaves plural "app hosts" untouched to match the forbidden-words boundary', () => {
    const input = `// Works across polyglot ${legacyAppHostName}s.`;
    expect(normalizeAspireTerminologyInCode(input)).toBe(input);
  });

  test('is idempotent', () => {
    const input = `// A ${legacyAspireName} ${legacyAppHostName}; run \`${legacyDotnetAspireName} run\`.`;
    const once = normalizeAspireTerminologyInCode(input);
    expect(normalizeAspireTerminologyInCode(once)).toBe(once);
  });

  test('passes null and undefined through unchanged', () => {
    expect(normalizeAspireTerminologyInCode(null)).toBeNull();
    expect(normalizeAspireTerminologyInCode(undefined)).toBeUndefined();
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
      readmeRaw:
        `# ${legacyAspireName} sample\n\n` +
        `Run the ${legacyAppHostName.toUpperCase()}.\n\n` +
        '```bash\n' +
        `${legacyDotnetAspireName} run\n` +
        '```\n',
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
      readmeRaw:
        '# Aspire sample\n\n' + 'Run the AppHost.\n\n' + '```bash\n' + 'dotnet aspire run\n' + '```\n',
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

  test('keeps generated sample prose normalized', () => {
    const proseFields = ['title', 'description', 'readme', 'readmeRaw'] as const;
    const violations = samples.flatMap((sample) =>
      proseFields
        .filter((field) => {
          const value = sample[field];
          return value != null && normalizeAspireTerminology(value) !== value;
        })
        .map((field) => `${sample.name}.${field}`)
    );

    expect(violations).toEqual([]);
  });
});
