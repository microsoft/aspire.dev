import { describe, expect, test } from 'vitest';

import GoMemberCard from '@components/api-reference/GoMemberCard.astro';
import { renderComponent, normalizeHtml } from './astro-test-utils';

// ReadableText inserts <wbr> hints inside identifiers and Astro scopes every class with a
// generated suffix; drop both so the markup reads as written in the component.
async function render(props: Record<string, unknown>): Promise<string> {
  const html = await renderComponent(GoMemberCard, { props });
  return normalizeHtml(
    html
      .replace(/<wbr\s*\/?>/g, '')
      .replace(/\s*\bastro-[a-z0-9]+\b/g, '')
      .replace(/\sclass=""/g, '')
  );
}

const addRedis = {
  name: 'AddRedis',
  description: 'Adds a Redis container resource.',
  signature: 'AddRedis(name string, options ...*AddRedisOptions) RedisResource',
  parameters: [{ name: 'name', type: 'string', description: 'The resource name.' }],
  options: {
    typeName: 'AddRedisOptions',
    fields: [
      { name: 'Port', type: '*float64', description: 'The host port.' },
      {
        name: 'Configure',
        type: 'func(cache Redis)',
        isCallback: true,
        callbackSignature: 'func(cache Redis) error',
        description: 'Configures the cache.',
      },
    ],
  },
  returnType: 'RedisResource',
  returns: 'A builder for the Redis resource.',
  errorModel: 'deferred',
};

describe('GoMemberCard', () => {
  test('renders a callable with its kind, description, signature, parameters, options and returns', async () => {
    const html = await render({ member: addRedis, variant: 'method' });

    expect(html).toContain('class="api-kind-pill kind-method"');
    expect(html).toContain('>method</span>');
    expect(html).toContain('<code class="mc-param-name">AddRedis</code>');
    expect(html).toContain('Adds a Redis container resource.');
    expect(html).toContain('data-language="go"');
    expect(html).toContain('Parameters</p>');
    expect(html).toContain('The resource name.');
    expect(html).toContain('Options</p>');
    expect(html).toContain('Returns</p>');
    expect(html).toContain('A builder for the Redis resource.');
  });

  test('adds the trailing options struct to the parameters and explains it under Options', async () => {
    const html = await render({ member: addRedis });

    expect(html).toContain('<code class="mc-param-name">options</code>');
    expect(html).toContain('<code>...*AddRedisOptions</code>');
    expect(html).toContain('Optional settings, described under Options.');
    expect(html).toContain('Optional parameters are passed in a trailing <code>options ...*AddRedisOptions</code> argument.');
    expect(html).toContain('The host port.');
    expect(html).toContain('Configures the cache.');
  });

  test('shows callback option fields with their callback signature and badge', async () => {
    const html = await render({ member: addRedis });

    expect(html).toContain('<code>func(cache Redis) error</code>');
    expect(html).toContain('<span class="api-mod-badge">callback</span>');
  });

  test('uses the default opts name when the signature does not name the options parameter', async () => {
    const html = await render({
      member: {
        name: 'WithDataVolume',
        signature: 'WithDataVolume(opts ...*WithDataVolumeOptions) RedisResource',
        options: { typeName: 'WithDataVolumeOptions', fields: [{ name: 'Name', type: '*string' }] },
        returnType: 'RedisResource',
        errorModel: 'deferred',
      },
    });

    expect(html).toContain('<code>opts ...*WithDataVolumeOptions</code>');
  });

  test('a direct options type is described as the existing struct', async () => {
    const html = await render({
      member: {
        name: 'CreateBuilder',
        signature: 'CreateBuilder(options ...*CreateBuilderOptions) (DistributedApplicationBuilder, error)',
        options: { typeName: 'CreateBuilderOptions', isDirect: true, fields: [] },
        returnType: '(DistributedApplicationBuilder, error)',
        errorModel: 'returned',
      },
    });

    expect(html).toContain('Optional parameters are passed as the existing <code>*CreateBuilderOptions</code> struct.');
    expect(html).not.toContain('in a trailing');
  });

  test.each([
    ['deferred', 'RedisResource', 'Returns a handle; failures surface later via <code>Err()</code>.'],
    ['returned', '(bool, error)', 'Returns <code>(bool, error)</code>.'],
    ['returned', 'error', 'Returns <code>error</code>.'],
    ['none', 'int', 'Returns <code>int</code>; no error is reported.'],
  ])('states the %s error model for %s in plain words', async (errorModel, returnType, sentence) => {
    const html = await render({ member: { name: 'Do', signature: 'Do() X', returnType, errorModel } });

    expect(html).toContain(sentence);
    expect(html).toContain('mc-go-error-model');
  });

  test('omits the Returns section when a callable declares neither a result nor an error model', async () => {
    const html = await render({ member: { name: 'Do', signature: 'Do()' } });

    expect(html).not.toContain('Returns</p>');
    expect(html).not.toContain('Parameters</p>');
    expect(html).not.toContain('Options</p>');
  });

  test('renders a linked name and the builder badge', async () => {
    const html = await render({
      member: { ...addRedis, returnsBuilder: true },
      href: '/reference/api/go/aspire.hosting.redis/addredis/',
    });

    expect(html).toContain('<a href="/reference/api/go/aspire.hosting.redis/addredis/" class="mc-name-link">');
    expect(html).toContain('<span class="api-mod-badge">builder</span>');
  });

  test('a function page can relabel the kind pill', async () => {
    const html = await render({ member: addRedis, variant: 'function', kindLabel: 'function' });

    expect(html).toContain('>function</span>');
    expect(html).not.toContain('>method</span>');
  });

  test('a property shows its type in the header, both accessor signatures and no callable sections', async () => {
    const html = await render({
      member: {
        name: 'Port',
        signature: 'Port() (*float64, error)',
        returnType: '*float64',
        description: 'The host port.',
        // Callable-only data on a property must not leak into the card.
        parameters: [{ name: 'ignored', type: 'string' }],
        errorModel: 'returned',
      },
      variant: 'property',
      badges: ['get', 'set'],
      relatedSignatures: ['SetPort(value *float64) error'],
    });

    expect(html).toContain('class="api-kind-pill kind-property"');
    expect(html).toContain('>property</span>');
    expect(html).toContain('<code>*float64</code>');
    expect(html).toContain('<span class="api-mod-badge">get</span>');
    expect(html).toContain('<span class="api-mod-badge">set</span>');
    expect(html).toContain('SetPort');
    expect(html).not.toContain('Parameters</p>');
    expect(html).not.toContain('Returns</p>');
    expect(html).not.toContain('mc-go-error-model');
  });

  test('a struct field has no kind pill or signature and shows its type and modifiers', async () => {
    const html = await render({
      member: { name: 'OnReady', returnType: 'func()', signature: 'should not render' },
      variant: 'field',
      badges: ['optional', 'callback'],
    });

    expect(html).not.toContain('api-kind-pill');
    expect(html).toContain('<code>func()</code>');
    expect(html).toContain('<span class="api-mod-badge">optional</span>');
    expect(html).toContain('<span class="api-mod-badge">callback</span>');
    expect(html).not.toContain('data-language="go"');
  });

  test('breaks a long signature onto one parameter per line', async () => {
    const html = await renderComponent(GoMemberCard, {
      props: {
        member: {
          name: 'WithEnvironment',
          signature: 'WithEnvironment(name string, value string) ResourceWithEnvironment',
        },
      },
    });

    // Expressive Code renders one element per source line.
    expect(html.match(/class="ec-line"/g)?.length).toBe(4);
  });

  test('renders code spans in the description, parameters, option fields and returns without raw backticks', async () => {
    const html = await render({
      member: {
        name: 'WithPort',
        description: 'Sets the `Port` option.',
        signature: 'WithPort(port int, options ...*WithPortOptions) RedisResource',
        parameters: [{ name: 'port', type: 'int', description: 'Use `0` for a random port.' }],
        options: {
          typeName: 'WithPortOptions',
          fields: [{ name: 'Name', type: '*string', description: 'Overrides the `name` annotation.' }],
        },
        returnType: 'RedisResource',
        returns: 'The `RedisResource` builder.',
        errorModel: 'deferred',
      },
    });

    expect(html).toContain('Sets the <code class="go-doc-code">Port</code> option.');
    expect(html).toContain('Use <code class="go-doc-code">0</code> for a random port.');
    expect(html).toContain('Overrides the <code class="go-doc-code">name</code> annotation.');
    expect(html).toContain('The <code class="go-doc-code">RedisResource</code> builder.');
    expect(html).not.toContain('`');
  });

  test('keeps the space around a code span at the end of a sentence', async () => {
    const html = await render({ member: { name: 'Do', signature: 'Do() error', description: 'Returns `error`.' } });

    expect(html).toContain('Returns <code class="go-doc-code">error</code>.');
  });

  test('links references to pages of the module and falls back to code without a module', async () => {
    const member = {
      name: 'AddRedis',
      description: 'Adds a {@ats-ref type:IResource} and a {@ats-ref type:IHost}.',
      signature: 'AddRedis() RedisResource',
    };
    const module = {
      package: { name: 'Aspire.Hosting' },
      handleTypes: [{ name: 'Resource', fullName: 'Aspire.Hosting.ApplicationModel.IResource' }],
    };

    expect(await render({ member, module, base: '/docs' })).toContain(
      'Adds a <a href="/docs/reference/api/go/aspire.hosting/resource/" class="go-doc-link">' +
        '<code class="go-doc-ref-link">Resource</code></a> and a <code class="go-doc-ref">IHost</code>.'
    );
    expect(await render({ member })).toContain(
      'Adds a <code class="go-doc-ref">IResource</code> and a <code class="go-doc-ref">IHost</code>.'
    );
  });
});
