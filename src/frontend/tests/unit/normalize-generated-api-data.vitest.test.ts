import { describe, expect, test } from 'vitest';

import { normalizeApiJsonText } from '../../scripts/normalize-generated-api-data';

// Build deprecated terms from tokens so this file never contains a literal
// forbidden phrase that the Forbidden Words check would flag.
const APP_HOST = ['app', 'host'].join(' ');
const NET_ASPIRE = ['.NET', 'Aspire'].join(' ');
const DOTNET_ASPIRE = ['dotnet', 'aspire'].join(' ');

/** Join lines with CRLF to mirror the .NET/AtsJson generators' output. */
const crlf = (lines: string[]): string => lines.join('\r\n');

describe('normalizeApiJsonText — C# API (pkgs) shape', () => {
  const doc = crlf([
    '{',
    '  "documentation": {',
    '    "summary": [',
    '      {',
    '        "kind": "text",',
    `        "text": " relative to the ${APP_HOST} project directory. "`,
    '      },',
    '      {',
    '        "kind": "text",',
    `        "text": "Not available in polyglot ${APP_HOST}s."`,
    '      },',
    '      {',
    '        "kind": "code",',
    `        "text": "${DOTNET_ASPIRE} run"`,
    '      },',
    '      {',
    '        "kind": "cref",',
    '        "cref": "T:Aspire.Hosting.Foo",',
    `        "text": "${APP_HOST}"`,
    '      }',
    '    ]',
    '  }',
    '}',
  ]);

  test('normalizes prose inside kind:"text" nodes', () => {
    const { text } = normalizeApiJsonText(doc);
    expect(text).toContain('"text": " relative to the AppHost project directory. "');
  });

  test('leaves plural "app hosts" untouched (matches the forbidden-words boundary)', () => {
    const { text } = normalizeApiJsonText(doc);
    expect(text).toContain(`"text": "Not available in polyglot ${APP_HOST}s."`);
  });

  test('never rewrites the text of code-bearing nodes (code, cref)', () => {
    const { text } = normalizeApiJsonText(doc);
    expect(text).toContain(`"text": "${DOTNET_ASPIRE} run"`);
    expect(text).toContain(`"cref": "T:Aspire.Hosting.Foo"`);
    // The cref node's display text is the only deprecated form left intact.
    expect(text).toContain(`"text": "${APP_HOST}"`);
  });

  test('counts exactly the changed occurrences', () => {
    expect(normalizeApiJsonText(doc).changes).toBe(1);
  });
});

describe('normalizeApiJsonText — TypeScript API (ts-modules) shape', () => {
  const doc = crlf([
    '{',
    `  "description": "Adds a first-class ${NET_ASPIRE} resource.",`,
    `  "returns": "The ${NET_ASPIRE} resource builder.",`,
    `  "remarks": "Only for a ${DOTNET_ASPIRE} app.",`,
    '  "signature": "addContainer(name: string): ContainerResource",',
    '  "returnType": "ContainerResource",',
    '  "targetTypeId": "Aspire.Hosting/Aspire.Hosting.IDistributedApplicationBuilder"',
    '}',
  ]);

  test('normalizes description, returns, and remarks prose', () => {
    const { text, changes } = normalizeApiJsonText(doc);
    expect(text).toContain('"description": "Adds a first-class Aspire resource."');
    expect(text).toContain('"returns": "The Aspire resource builder."');
    expect(text).toContain('"remarks": "Only for an Aspire app."');
    expect(changes).toBe(3);
  });

  test('never rewrites code identifiers (signature, returnType, ids)', () => {
    const { text } = normalizeApiJsonText(doc);
    expect(text).toContain('"signature": "addContainer(name: string): ContainerResource"');
    expect(text).toContain('"returnType": "ContainerResource"');
    expect(text).toContain(
      '"targetTypeId": "Aspire.Hosting/Aspire.Hosting.IDistributedApplicationBuilder"'
    );
  });
});

describe('normalizeApiJsonText — byte preservation', () => {
  test('preserves CRLF line endings and escaped astral characters', () => {
    const doc = crlf([
      '{',
      '  "kind": "text",',
      `  "text": "\\uD83D\\uDCE6 uses the ${APP_HOST} directory"`,
      '}',
    ]);
    const { text } = normalizeApiJsonText(doc);
    // astral escape untouched, CRLF intact, only the phrase changed.
    expect(text).toBe(
      crlf(['{', '  "kind": "text",', '  "text": "\\uD83D\\uDCE6 uses the AppHost directory"', '}'])
    );
    expect(text.includes('\r\n')).toBe(true);
  });

  test('returns the input byte-for-byte when there is nothing to normalize', () => {
    const clean = crlf([
      '{',
      '  "kind": "text",',
      '  "text": "Configures the AppHost with an Aspire resource."',
      '}',
    ]);
    const { text, changes } = normalizeApiJsonText(clean);
    expect(changes).toBe(0);
    expect(text).toBe(clean);
  });

  test('is idempotent', () => {
    const doc = crlf(['{', '  "kind": "text",', `  "text": "the ${APP_HOST} runs"`, '}']);
    const once = normalizeApiJsonText(doc).text;
    const twice = normalizeApiJsonText(once);
    expect(twice.changes).toBe(0);
    expect(twice.text).toBe(once);
  });
});
