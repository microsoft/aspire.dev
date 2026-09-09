import { describe, expect, test } from 'vitest';

import samples from '@data/samples.json';
import {
  appHostBrandColor,
  appHostCodeLang,
  appHostFallbackGlyph,
  appHostLabel,
  appHostShortLabel,
  isAppHostEnabled,
  type AppHostKind,
} from '@utils/samples';

import {
  normalizeAspireTerminology,
  normalizeAspireTerminologyInCode,
} from '../../scripts/aspire-terminology';
import {
  detectAppHost,
  detectTags,
  type SampleResult,
  normalizeSampleTerminology,
} from '../../scripts/update-samples';

const legacyAspireName = ['.NET', 'Aspire'].join(' ');
const legacyDotnetAspireName = ['dotnet', 'aspire'].join(' ');
const legacyAppHostName = ['app', 'host'].join(' ');

describe('sample AppHost detection', () => {
  test.each([
    ['TypeScript module', ['apphost.mts'], 'typescript', 'apphost.mts'],
    ['legacy TypeScript', ['src/apphost.ts'], 'typescript', 'src/apphost.ts'],
    ['Python', ['apphost.py'], 'python', 'apphost.py'],
    ['Go', ['nested/apphost.go'], 'go', 'nested/apphost.go'],
    ['Java', ['AppHost.java'], 'java', 'AppHost.java'],
    ['Rust', ['apphost.rs'], 'rust', 'apphost.rs'],
  ] as const)('detects the %s entry point', (_name, paths, kind, entryPath) => {
    expect(detectAppHost(paths)).toEqual({ kind, entryPath });
  });

  test('detects a C# project and prefers AppHost.cs over Program.cs', () => {
    expect(
      detectAppHost([
        'Store.AppHost/Program.cs',
        'Store.AppHost/Store.AppHost.csproj',
        'Store.AppHost/AppHost.cs',
      ])
    ).toEqual({
      kind: 'csproj',
      entryPath: 'Store.AppHost/AppHost.cs',
    });
  });

  test('uses Program.cs and then the project file as deterministic C# project fallbacks', () => {
    expect(
      detectAppHost(['Store.AppHost/Store.AppHost.csproj', 'Store.AppHost/Program.cs'])
    ).toEqual({
      kind: 'csproj',
      entryPath: 'Store.AppHost/Program.cs',
    });
    expect(detectAppHost(['Store.AppHost/Store.AppHost.csproj'])).toEqual({
      kind: 'csproj',
      entryPath: 'Store.AppHost/Store.AppHost.csproj',
    });
  });

  test('detects a file-based C# AppHost', () => {
    expect(detectAppHost(['src/AppHost.cs'])).toEqual({
      kind: 'file-based',
      entryPath: 'src/AppHost.cs',
    });
  });

  test('uses registry order for precedence and ignores substring collisions', () => {
    expect(
      detectAppHost([
        'apphost.rs',
        'AppHost.java',
        'apphost.go',
        'apphost.py',
        'Store.AppHost/Store.AppHost.csproj',
        'apphost.ts',
        'apphost.mts',
      ])
    ).toEqual({
      kind: 'typescript',
      entryPath: 'apphost.mts',
    });

    expect(
      detectAppHost([
        'myapphost.ts',
        'not-apphost.py.txt',
        'myapphost.go.bak',
        'AppHost.java.disabled',
        'apphost.rs.example',
        'Store.AppHost.csproj.user',
        'NestedAppHost.cs',
      ])
    ).toBeNull();
  });

  test.each(['typescript', 'csproj', 'file-based', 'python', 'go', 'java', 'rust'] as const)(
    'promotes the detected %s AppHost language to a tag',
    (kind) => {
      const expected = kind === 'csproj' || kind === 'file-based' ? 'csharp' : kind;
      expect(detectTags('sample', '', kind)).toContain(expected);
    }
  );
});

describe('sample AppHost presentation metadata', () => {
  test.each([
    ['typescript', 'TypeScript AppHost', 'TypeScript AppHost', 'typescript', '#3178c6', 'TS'],
    ['csproj', 'C# AppHost (project-based)', 'C# project AppHost', 'csharp', '#512bd4', 'C#'],
    ['file-based', 'C# AppHost (file-based)', 'C# file-based AppHost', 'csharp', '#512bd4', 'C#'],
    [
      'python',
      'Python AppHost (Experimental)',
      'Python AppHost (Experimental)',
      'python',
      '#3776ab',
      'Py',
    ],
    ['go', 'Go AppHost (Experimental)', 'Go AppHost (Experimental)', 'go', '#00add8', 'Go'],
    ['java', 'Java AppHost (Experimental)', 'Java AppHost (Experimental)', 'java', '#e76f00', 'J'],
    ['rust', 'Rust AppHost (Experimental)', 'Rust AppHost (Experimental)', 'rust', '#ce412b', 'Rs'],
  ] as const)(
    'uses registry labels and code fences for %s',
    (kind, label, shortLabel, fence, color, glyph) => {
      expect(appHostLabel(kind)).toBe(label);
      expect(appHostShortLabel(kind)).toBe(shortLabel);
      expect(appHostCodeLang(kind, kind === 'csproj' ? 'AppHost.cs' : null)).toBe(fence);
      expect(appHostBrandColor(kind)).toBe(color);
      expect(appHostFallbackGlyph(kind)).toBe(glyph);
    }
  );

  test('uses XML highlighting only when a C# project file is the entry-point fallback', () => {
    expect(appHostCodeLang('csproj', 'Store.AppHost.csproj')).toBe('xml');
    expect(appHostCodeLang('csproj', 'Program.cs')).toBe('csharp');
  });

  test.each([
    ['typescript', true],
    ['csproj', true],
    ['file-based', true],
    ['python', false],
    ['go', false],
    ['java', false],
    ['rust', false],
  ] as const)('reflects registry activation for %s', (kind, enabled) => {
    expect(isAppHostEnabled(kind as AppHostKind)).toBe(enabled);
  });
});

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
    [
      'a C# interpolation expression',
      `var value = $"{Get(/* ${legacyAppHostName} */ 1)}";`,
      'var value = $"{Get(/* AppHost */ 1)}";',
    ],
    [
      'a TS template interpolation expression',
      `const value = \`\${Get(/* ${legacyAppHostName} */ 1)}\`;`,
      'const value = `${Get(/* AppHost */ 1)}`;',
    ],
  ])('normalizes a comment nested inside %s', (_scenario, input, expected) => {
    expect(normalizeAspireTerminologyInCode(input)).toBe(expected);
  });

  test('normalizes an interpolation comment while preserving a nested string literal', () => {
    const input = `var value = $"{Get(/* ${legacyAppHostName} */ "// ${legacyAppHostName}")}";`;
    expect(normalizeAspireTerminologyInCode(input)).toBe(
      `var value = $"{Get(/* AppHost */ "// ${legacyAppHostName}")}";`
    );
  });

  test.each([
    ['a double-quoted string literal', `var cmd = "${legacyDotnetAspireName} run";`],
    ['a C# verbatim string', `var path = @"C:\\${legacyAppHostName}\\bin";`],
    [
      'a string nested in a C# interpolation expression',
      'var value = $"{Get("// ' + legacyAppHostName + '")}";',
    ],
    ['a C# raw string', 'var value = """// ' + legacyAppHostName + '""";'],
    ['a C# interpolated raw string', 'var value = $"""{Get("// ' + legacyAppHostName + '")}""";'],
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

  test('resumes comment normalization after a C# interpolated string', () => {
    const input =
      'var value = $"{Get("// ' + legacyAppHostName + '")}"; // Start the ' + legacyAppHostName;
    expect(normalizeAspireTerminologyInCode(input)).toBe(
      'var value = $"{Get("// ' + legacyAppHostName + '")}"; // Start the AppHost'
    );
  });

  test('normalizes the plural form in code comments', () => {
    const input = `// Polyglot ${legacyAppHostName}s use the exported API.`;
    expect(normalizeAspireTerminologyInCode(input)).toBe(
      '// Polyglot AppHosts use the exported API.'
    );
  });

  test('preserves verb usage of hosts', () => {
    const input = `// The ${legacyAppHostName}s a service.`;
    expect(normalizeAspireTerminologyInCode(input)).toBe(input);
  });

  test('preserves inline code and is idempotent', () => {
    const input = `// A ${legacyAspireName} ${legacyAppHostName}; run \`${legacyDotnetAspireName} run\`.`;
    const expected = `// An Aspire AppHost; run \`${legacyDotnetAspireName} run\`.`;
    const once = normalizeAspireTerminologyInCode(input);
    expect(once).toBe(expected);
    expect(normalizeAspireTerminologyInCode(once)).toBe(expected);
  });

  test('preserves fenced code inside block comments', () => {
    const input =
      `/* Configure the ${legacyAppHostName} with this command:\n` +
      '```bash\n' +
      `${legacyDotnetAspireName} run\n` +
      '```\n' +
      `Then start the ${legacyAppHostName}.\n` +
      '*/';
    expect(normalizeAspireTerminologyInCode(input)).toBe(
      '/* Configure the AppHost with this command:\n' +
        '```bash\n' +
        `${legacyDotnetAspireName} run\n` +
        '```\n' +
        'Then start the AppHost.\n' +
        '*/'
    );
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
        '# Aspire sample\n\n' +
        'Run the AppHost.\n\n' +
        '```bash\n' +
        'dotnet aspire run\n' +
        '```\n',
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
