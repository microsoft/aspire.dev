import { describe, expect, test } from 'vitest';

import {
  normalizeGoDocMarkdown,
  parseGoDocText,
  renderGoDocTextHtml,
  toSearchGoDocText,
  truncateGoDocText,
} from '@utils/go-doc-text';

describe('parseGoDocText', () => {
  test('keeps plain text as one segment', () => {
    expect(parseGoDocText('Adds a Redis resource.')).toEqual([
      { kind: 'text', text: 'Adds a Redis resource.' },
    ]);
  });

  test('turns inline code into a code segment and keeps the text around it', () => {
    expect(parseGoDocText('Returns `error`.')).toEqual([
      { kind: 'text', text: 'Returns ' },
      { kind: 'code', text: 'error' },
      { kind: 'text', text: '.' },
    ]);
  });

  test('reads a CLR arity suffix as part of one code span and drops it', () => {
    expect(parseGoDocText('Wraps `IResourceBuilder`1` values.')).toEqual([
      { kind: 'text', text: 'Wraps ' },
      { kind: 'code', text: 'IResourceBuilder' },
      { kind: 'text', text: ' values.' },
    ]);
  });

  test('reads several adjacent code spans separately', () => {
    expect(parseGoDocText('`a` and `b`')).toEqual([
      { kind: 'code', text: 'a' },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: 'b' },
    ]);
  });

  test('leaves a lone backtick as text', () => {
    expect(parseGoDocText('A stray ` backtick.')).toEqual([
      { kind: 'text', text: 'A stray ` backtick.' },
    ]);
  });

  test('reads a flattened fence as one code segment, not three empty spans', () => {
    expect(parseGoDocText('Example: ``` var x = 1; ``` end')).toEqual([
      { kind: 'text', text: 'Example: ' },
      { kind: 'code', text: 'var x = 1;' },
      { kind: 'text', text: ' end' },
    ]);
  });

  test.each([
    ['{@ats-ref type:Resource}', 'type', 'Resource', 'Resource'],
    ['{@ats-ref method:Owner.member}', 'method', 'Owner.member', 'Owner.member'],
    ['{@ats-ref field:Thing.value|the value}', 'field', 'Thing.value', 'the value'],
  ])('reads %s as a reference', (text, refKind, target, label) => {
    expect(parseGoDocText(text)).toEqual([{ kind: 'ref', refKind, target, label }]);
  });

  test('keeps text that follows a reference, such as a possessive', () => {
    expect(parseGoDocText("The {@ats-ref type:IResource}'s name")).toEqual([
      { kind: 'text', text: 'The ' },
      { kind: 'ref', refKind: 'type', target: 'IResource', label: 'IResource' },
      { kind: 'text', text: "'s name" },
    ]);
  });

  test('ignores a marker that is not a known reference kind', () => {
    expect(parseGoDocText('{@ats-ref other:Thing}')).toEqual([
      { kind: 'text', text: '{@ats-ref other:Thing}' },
    ]);
  });

  test('reads an http(s) markdown link and ignores any other scheme', () => {
    expect(parseGoDocText('See [RFC 7239](https://tools.ietf.org/html/rfc7239).')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'link', text: 'RFC 7239', href: 'https://tools.ietf.org/html/rfc7239' },
      { kind: 'text', text: '.' },
    ]);
    expect(parseGoDocText('[x](javascript:alert(1))')).toEqual([
      { kind: 'text', text: '[x](javascript:alert(1))' },
    ]);
  });

  test('returns no segments for empty text', () => {
    expect(parseGoDocText('')).toEqual([]);
  });
});

describe('toSearchGoDocText', () => {
  test('keeps code spans, resolves references to their label and unwraps links', () => {
    expect(
      toSearchGoDocText(
        'Use `error` with {@ats-ref type:Resource} per [RFC](https://example.com/rfc) and `IResourceBuilder`1`.'
      )
    ).toBe('Use `error` with `Resource` per RFC and `IResourceBuilder`.');
  });

  test('leaves plain text unchanged', () => {
    expect(toSearchGoDocText('Property on RedisResource (get/set)')).toBe(
      'Property on RedisResource (get/set)'
    );
  });
});

describe('truncateGoDocText', () => {
  test('returns short text unchanged', () => {
    expect(truncateGoDocText('Short `text`.', 160)).toBe('Short `text`.');
  });

  test('cuts long text and trims the end', () => {
    expect(truncateGoDocText('alpha beta gamma', 11)).toBe('alpha beta');
  });

  test('never leaves half of a code span behind', () => {
    expect(truncateGoDocText('Call `WithDataVolume` now', 12)).toBe('Call');
  });

  test('keeps a complete code span that fits', () => {
    expect(truncateGoDocText('Call `Go` now', 9)).toBe('Call `Go`');
  });
});

describe('renderGoDocTextHtml', () => {
  test('escapes text and wraps code and references without emitting anchors', () => {
    const html = renderGoDocTextHtml(
      'a < b & `x<y` {@ats-ref type:Foo} [RFC](https://example.com/rfc)'
    );

    expect(html).toBe(
      'a &lt; b &amp; <code class="go-doc-code">x&lt;y</code> <code class="go-doc-ref">Foo</code> RFC'
    );
    expect(html).not.toContain('<a');
  });

  test('escapes quotes so values cannot break out of an attribute', () => {
    expect(renderGoDocTextHtml(`say "hi" it's`)).toBe('say &quot;hi&quot; it&#39;s');
  });

  test('escapes the label of a reference', () => {
    expect(renderGoDocTextHtml('{@ats-ref type:A|<b>}')).toBe(
      '<code class="go-doc-ref">&lt;b&gt;</code>'
    );
  });
});

describe('normalizeGoDocMarkdown', () => {
  test('rewrites references to code and drops CLR arity', () => {
    expect(
      normalizeGoDocMarkdown(
        'Wraps `IResourceBuilder`1` for {@ats-ref type:Resource} and {@ats-ref method:A.b|b}.'
      )
    ).toBe('Wraps `IResourceBuilder` for `Resource` and `b`.');
  });

  test('keeps markdown code, fences and links as they are', () => {
    const text = 'See [RFC](https://example.com/rfc) and `x`.\n\n```go\nvar x = 1\n```';
    expect(normalizeGoDocMarkdown(text)).toBe(text);
  });
});
