import { describe, expect, test } from 'vitest';

import GoDocText from '@components/api-reference/GoDocText.astro';
import type { GoApiDocument } from '@utils/go-modules';
import { normalizeHtml, renderComponent } from './astro-test-utils';

// ReadableText inserts <wbr> hints inside identifiers; drop them so the markup reads as written.
async function render(props: Record<string, unknown>): Promise<string> {
  const html = await renderComponent(GoDocText, { props });
  return normalizeHtml(html.replace(/<wbr\s*\/?>/g, ''));
}

const hostingModule: GoApiDocument = {
  package: { name: 'Aspire.Hosting' },
  handleTypes: [{ name: 'Resource', fullName: 'Aspire.Hosting.ApplicationModel.IResource' }],
};

describe('GoDocText', () => {
  test('renders plain text and escapes markup-like text', async () => {
    expect(await render({ text: 'Wraps <T> values & more.' })).toBe(
      'Wraps &lt;T&gt; values &amp; more.'
    );
  });

  test('renders inline code as styled code and keeps the spaces around it', async () => {
    expect(await render({ text: 'Returns `error`.' })).toBe(
      'Returns <code class="go-doc-code">error</code>.'
    );
    expect(await render({ text: 'Use `a` or `b` here' })).toBe(
      'Use <code class="go-doc-code">a</code> or <code class="go-doc-code">b</code> here'
    );
  });

  test('shows a CLR generic arity span without the arity', async () => {
    expect(await render({ text: 'Wraps `IResourceBuilder`1` values.' })).toBe(
      'Wraps <code class="go-doc-code">IResourceBuilder</code> values.'
    );
  });

  test('renders a reference as plain code when no module is given', async () => {
    expect(await render({ text: 'See {@ats-ref type:IResource}.' })).toBe(
      'See <code class="go-doc-ref">IResource</code>.'
    );
  });

  test('links a reference to a type of the module, shows its Go name and keeps the text after it', async () => {
    const html = await render({
      text: 'The {@ats-ref type:IResource} name.',
      module: hostingModule,
      base: '/docs',
    });

    expect(html).toBe(
      'The <a href="/docs/reference/api/go/aspire.hosting/resource/" class="go-doc-link">' +
        '<code class="go-doc-ref-link">Resource</code></a> name.'
    );
  });

  test('keeps a reference that the module does not declare as plain code', async () => {
    expect(await render({ text: '{@ats-ref type:IHost}', module: hostingModule })).toBe(
      '<code class="go-doc-ref">IHost</code>'
    );
  });

  test('does not nest anchors inside another link but still shows the Go name', async () => {
    const html = await render({
      text: '{@ats-ref type:IResource} and [RFC 7239](https://tools.ietf.org/html/rfc7239)',
      module: hostingModule,
      link: false,
    });

    expect(html).toBe('<code class="go-doc-ref">Resource</code> and RFC 7239');
  });

  test('opens external links in a new tab without leaking the opener', async () => {
    expect(await render({ text: 'See [RFC 7239](https://tools.ietf.org/html/rfc7239).' })).toBe(
      'See <a href="https://tools.ietf.org/html/rfc7239" class="go-doc-link" target="_blank" rel="noopener noreferrer">RFC 7239</a>.'
    );
  });

  test('leaves a link with an unsupported scheme as text', async () => {
    expect(await render({ text: 'Click [here](javascript:alert(1)).' })).toBe(
      'Click [here](javascript:alert(1)).'
    );
  });
});
