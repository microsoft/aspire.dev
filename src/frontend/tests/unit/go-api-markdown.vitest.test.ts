import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIRoute } from 'astro';
import { describe, expect, test, vi } from 'vitest';
import {
  goIndexMdHref,
  goItemMdHref,
  goMemberMdHref,
  goModuleMdHref,
  renderGoIndexMarkdown,
  renderGoItemMarkdown,
  renderGoMemberMarkdownPage,
  renderGoModuleMarkdown,
} from '@utils/go-api-markdown';
import { prepareGoApiRoutes } from '@utils/go-api-routes';
import { GO_EXPERIMENTAL_NOTE } from '@utils/go-modules';
import type {
  GoApiDocument,
  GoDtoType,
  GoEnumType,
  GoFunction,
  GoHandleType,
} from '@utils/go-modules';
import { GET as getIndex } from '../../src/pages/reference/api/go.md';
import { GET as getModule, getStaticPaths as modulePaths } from '../../src/pages/reference/api/go/[module].md';
import { GET as getItem, getStaticPaths as itemPaths } from '../../src/pages/reference/api/go/[module]/[item].md';
import {
  GET as getMember,
  getStaticPaths as memberPaths,
} from '../../src/pages/reference/api/go/[module]/[item]/[member].md';

vi.mock('astro:content', () => ({
  getCollection: () => {
    const directory = fileURLToPath(new URL('../../src/data/go-modules/', import.meta.url));
    return Promise.resolve(
      readdirSync(directory)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((file) => {
          const data = JSON.parse(readFileSync(join(directory, file), 'utf8')) as GoApiDocument;
          prepareGoApiRoutes(data);
          return { id: file, data };
        })
    );
  },
}));

/* ---- Inline fixture: a small Redis-like module ---------------------- */

const hostGetter: GoFunction = {
  name: 'Host',
  qualifiedName: 'RedisResource.host',
  kind: 'PropertyGetter',
  signature: 'Host() (string, error)',
  receiver: 'RedisResource',
  returnType: '(string, error)',
  errorModel: 'returned',
  description: 'The host name.',
};

const portGetter: GoFunction = {
  name: 'Port',
  qualifiedName: 'RedisResource.port',
  kind: 'PropertyGetter',
  signature: 'Port() (*float64, error)',
  receiver: 'RedisResource',
  returnType: '(*float64, error)',
  errorModel: 'returned',
};

const portSetter: GoFunction = {
  name: 'SetPort',
  qualifiedName: 'RedisResource.setPort',
  kind: 'PropertySetter',
  signature: 'SetPort(value *float64) error',
  receiver: 'RedisResource',
  parameters: [{ name: 'value', type: '*float64' }],
  returnType: 'error',
  errorModel: 'returned',
};

const tokenSetter: GoFunction = {
  name: 'SetToken',
  qualifiedName: 'RedisResource.setToken',
  kind: 'PropertySetter',
  signature: 'SetToken(value string) error',
  receiver: 'RedisResource',
  parameters: [{ name: 'value', type: 'string' }],
  returnType: 'error',
  errorModel: 'returned',
  description: 'Sets the token.',
};

const withModule: GoFunction = {
  name: 'WithModule',
  capabilityId: 'Aspire.Hosting.Redis/withModule',
  qualifiedName: 'withModule',
  kind: 'Method',
  signature: 'WithModule(path string) RedisResource',
  receiver: 'RedisResource',
  parameters: [{ name: 'path', type: 'string', description: 'The module path.' }],
  returnType: 'RedisResource',
  returns: 'The same resource, for chaining.',
  errorModel: 'deferred',
  appliesTo: ['RedisResource'],
  description: 'Adds a Redis module.',
};

const withDataVolume: GoFunction = {
  name: 'WithDataVolume',
  capabilityId: 'Aspire.Hosting.Redis/withDataVolume',
  qualifiedName: 'withDataVolume',
  kind: 'Method',
  signature: 'WithDataVolume(opts ...*WithDataVolumeOptions) RedisResource',
  receiver: 'RedisResource',
  options: {
    typeName: 'WithDataVolumeOptions',
    fields: [
      { name: 'Name', jsonName: 'name', type: '*string', description: 'The volume name.' },
      {
        name: 'Configure',
        jsonName: 'configure',
        type: 'func(volume Volume)',
        isCallback: true,
        callbackSignature: 'func(volume Volume) error',
        description: 'Configures the volume.',
      },
    ],
  },
  returnType: 'RedisResource',
  errorModel: 'deferred',
  appliesTo: ['RedisResource'],
};

const ping: GoFunction = {
  name: 'Ping',
  qualifiedName: 'RedisResource.ping',
  kind: 'InstanceMethod',
  signature: 'Ping() (bool, error)',
  receiver: 'RedisResource',
  returnType: '(bool, error)',
  returns: 'Whether the server answered.',
  errorModel: 'returned',
};

const close: GoFunction = {
  name: 'Close',
  qualifiedName: 'RedisResource.close',
  kind: 'InstanceMethod',
  signature: 'Close() error',
  receiver: 'RedisResource',
  returnType: 'error',
  errorModel: 'returned',
};

const count: GoFunction = {
  name: 'Count',
  qualifiedName: 'RedisResource.count',
  kind: 'InstanceMethod',
  signature: 'Count() int',
  receiver: 'RedisResource',
  returnType: 'int',
  errorModel: 'none',
};

const withEnvironment: GoFunction = {
  name: 'WithEnvironment',
  qualifiedName: 'withEnvironment',
  kind: 'Method',
  signature: 'WithEnvironment(name string, value string) ResourceWithEnvironment',
  receiver: 'ResourceWithEnvironment',
  parameters: [
    { name: 'name', type: 'string' },
    { name: 'value', type: 'string' },
  ],
  returnType: 'ResourceWithEnvironment',
  errorModel: 'deferred',
  appliesTo: ['RedisResource', 'ContainerResource'],
  description: 'Sets an environment variable.',
};

const addRedis: GoFunction = {
  name: 'AddRedis',
  capabilityId: 'Aspire.Hosting.Redis/addRedis',
  qualifiedName: 'addRedis',
  kind: 'Method',
  signature: 'AddRedis(name string, options ...*AddRedisOptions) RedisResource',
  receiver: 'DistributedApplicationBuilder',
  parameters: [{ name: 'name', type: 'string', description: 'The resource name.' }],
  options: {
    typeName: 'AddRedisOptions',
    fields: [
      { name: 'Port', jsonName: 'port', type: '*float64', description: 'The host port.' },
      { name: 'Mode', jsonName: 'mode', type: '*RedisMode' },
    ],
  },
  returnType: 'RedisResource',
  returns: 'A builder for the Redis resource.',
  errorModel: 'deferred',
  appliesTo: ['DistributedApplicationBuilder'],
  description: 'Adds a Redis container resource.',
};

const configureRedis: GoFunction = {
  name: 'ConfigureRedis',
  qualifiedName: 'configureRedis',
  kind: 'Method',
  signature: 'ConfigureRedis(options ...*RedisOptions) (RedisResource, error)',
  receiver: 'DistributedApplicationBuilder',
  options: { typeName: 'RedisOptions', isDirect: true },
  returnType: '(RedisResource, error)',
  errorModel: 'returned',
  appliesTo: ['DistributedApplicationBuilder'],
};

const createRedisBuilder: GoFunction = {
  name: 'CreateRedisBuilder',
  qualifiedName: 'createRedisBuilder',
  kind: 'Method',
  signature: 'CreateRedisBuilder() (DistributedApplicationBuilder, error)',
  returnType: '(DistributedApplicationBuilder, error)',
  errorModel: 'returned',
  description: 'Creates a builder.',
};

const redisResource: GoHandleType = {
  name: 'RedisResource',
  fullName: 'Aspire.Hosting.Redis.RedisResource',
  kind: 'handle',
  description: 'Represents a Redis container resource.',
  // The fence below is intentionally never closed, like real XML-doc remarks.
  remarks: 'Chain calls on the builder:\n\n```go\nredis := builder.AddRedis("cache")\nredis.WithModule("x")\n',
  implementedInterfaces: ['Resource', 'ResourceWithEnvironment', 'ExternalType'],
  capabilities: [hostGetter, portGetter, portSetter, tokenSetter, withModule, withDataVolume, ping, close, count],
};

const resourceWithEnvironment: GoHandleType = {
  name: 'ResourceWithEnvironment',
  kind: 'handle',
  isInterface: true,
  description: 'Resources that accept environment variables.',
  implementedInterfaces: ['Resource'],
  capabilities: [withEnvironment],
};

const resource: GoHandleType = {
  name: 'Resource',
  kind: 'handle',
  isInterface: true,
  isMarker: true,
  description: 'Any resource.',
  implementedInterfaces: [],
  capabilities: [],
};

const inputCollection: GoHandleType = {
  name: 'InputCollection',
  kind: 'handle',
  description: 'A collection of inputs.',
  implementedInterfaces: [],
  capabilities: [],
  synthesizedMembers: [
    {
      name: 'Get',
      signature: 'Get(name string) (*Input, error)',
      description: 'Get returns the input with the specified name,\nor nil if no input matches.',
    },
  ],
};

const redisOptions: GoDtoType = {
  name: 'RedisOptions',
  fullName: 'Aspire.Hosting.Redis.RedisOptions',
  kind: 'dto',
  description: 'Options for Redis.',
  fields: [
    { name: 'Port', jsonName: 'port', type: '*float64', isOptional: true, description: 'The host port.' },
    { name: 'Modules', jsonName: 'modules', type: '[]RedisMode' },
    { name: 'OnReady', jsonName: 'onReady', type: 'func()', isCallback: true, description: 'Called when ready.' },
  ],
};

const redisMode: GoEnumType = {
  name: 'RedisMode',
  fullName: 'Aspire.Hosting.Redis.RedisMode',
  kind: 'enum',
  description: 'Redis modes.',
  members: [
    { name: 'RedisModeStandalone', value: 'Standalone', description: 'A single node.' },
    { name: 'RedisModeCluster', value: 'Cluster' },
  ],
};

const redisDoc: GoApiDocument = {
  package: {
    name: 'Aspire.Hosting.Redis',
    version: '13.6.0',
    language: 'go',
    importPath: 'apphost/modules/aspire',
    sourceRepository: 'https://github.com/microsoft/aspire',
    sourceCommit: 'abc1234',
  },
  functions: [
    addRedis,
    configureRedis,
    createRedisBuilder,
    withModule,
    withDataVolume,
    withEnvironment,
    hostGetter,
    portGetter,
    portSetter,
    tokenSetter,
    ping,
    close,
    count,
  ],
  handleTypes: [redisResource, resourceWithEnvironment, resource, inputCollection],
  dtoTypes: [redisOptions],
  enumTypes: [redisMode],
  exportedValues: [
    {
      name: 'RedisModules',
      fullName: 'Aspire.Hosting.Redis.RedisModules',
      kind: 'exportedValue',
      values: [{ path: 'Json', type: 'string', value: '"redis/redis-stack"', description: 'The JSON module.' }],
    },
  ],
};

const hostingDoc: GoApiDocument = {
  package: { name: 'Aspire.Hosting', version: '13.6.0', language: 'go', importPath: 'apphost/modules/aspire' },
  functions: [{ name: 'CreateBuilder', signature: 'CreateBuilder() error', returnType: 'error' }],
  handleTypes: [{ name: 'DistributedApplicationBuilder' }],
};

/* ---- Helpers --------------------------------------------------------- */

const base = '';
const redisModuleHref = '/reference/api/go/aspire.hosting.redis';

// The markdown CLI parser reads index and module bullets with this shape.
const cliBullet = /^-\s+\[(?<name>[^\]]+)\]\((?<href>[^)]+)\)(?<tail>.*)$/;

function sectionOf(markdown: string, title: string): string {
  const parts = markdown.split(/^## /m).slice(1);
  const found = parts.find((part) => part.startsWith(`${title}\n`));
  if (!found) {
    throw new Error(`Missing "## ${title}" section.`);
  }

  return found.slice(title.length + 1).trim();
}

function bulletEntries(markdown: string, title: string): Array<{ name: string; href: string; tail: string }> {
  return sectionOf(markdown, title)
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => {
      const groups = cliBullet.exec(line)?.groups;
      if (!groups) {
        throw new Error(`Not a CLI-parseable bullet: ${line}`);
      }

      return { name: groups.name, href: groups.href, tail: groups.tail };
    });
}

function headingsOutsideFences(markdown: string): string[] {
  const headings: string[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (!inFence && /^#{1,6} /.test(line)) {
      headings.push(line);
    }
  }

  return headings;
}

function hasDanglingFence(markdown: string): boolean {
  let openLength: number | undefined;
  for (const line of markdown.split('\n')) {
    const match = /^ {0,3}(`{3,})(.*)$/.exec(line);
    if (openLength === undefined) {
      if (match && !match[2].includes('`')) openLength = match[1].length;
    } else if (match && match[1].length >= openLength && match[2].trim() === '') {
      openLength = undefined;
    }
  }

  return openLength !== undefined;
}

/* ---- Hrefs ------------------------------------------------------------ */

describe('Go markdown hrefs', () => {
  test('build module-local .md routes and honour the base path', () => {
    expect(goIndexMdHref('')).toBe('/reference/api/go.md');
    expect(goModuleMdHref('', 'Aspire.Hosting.Redis')).toBe(`${redisModuleHref}.md`);
    expect(goItemMdHref('', 'Aspire.Hosting.Redis', 'redisresource')).toBe(`${redisModuleHref}/redisresource.md`);
    expect(goMemberMdHref('', 'Aspire.Hosting.Redis', 'redisresource', 'withmodule')).toBe(
      `${redisModuleHref}/redisresource/withmodule.md`
    );
    expect(goIndexMdHref('/docs/')).toBe('/docs/reference/api/go.md');
    expect(goModuleMdHref('/docs/', 'Aspire.Hosting.Redis')).toBe('/docs/reference/api/go/aspire.hosting.redis.md');
  });
});

/* ---- Index and module pages ------------------------------------------- */

describe('Go index markdown', () => {
  const markdown = renderGoIndexMarkdown([redisDoc, hostingDoc], base);

  test('introduces the flat import path and the experimental note', () => {
    expect(markdown.startsWith('# Go API Reference\n')).toBe(true);
    expect(markdown).toContain('imported as `apphost/modules/aspire`.');
    expect(markdown).toContain(`> ${GO_EXPERIMENTAL_NOTE}`);
    expect(GO_EXPERIMENTAL_NOTE).toBe('The Go AppHost SDK is experimental.');
  });

  test('lists modules as "- [Name](href) -- detail" bullets sorted by name', () => {
    const entries = bulletEntries(markdown, 'Modules');
    expect(entries.map((entry) => entry.name)).toEqual(['Aspire.Hosting', 'Aspire.Hosting.Redis']);
    expect(entries.map((entry) => entry.href)).toEqual([
      '/reference/api/go/aspire.hosting.md',
      `${redisModuleHref}.md`,
    ]);

    const functionCount = redisDoc.functions?.filter((fn) => !fn.qualifiedName?.includes('.')).length;
    const typeCount =
      (redisDoc.handleTypes?.length ?? 0) + (redisDoc.dtoTypes?.length ?? 0) + (redisDoc.enumTypes?.length ?? 0);
    expect(entries[1].tail).toBe(` -- v13.6.0 - ${functionCount} functions - ${typeCount} types`);
  });

  test('uses the plain separators the markdown normaliser produces', () => {
    expect(markdown).not.toMatch(/[·—–…]/);
  });

  test('names every distinct import path when modules disagree', () => {
    const other: GoApiDocument = { package: { name: 'Other', importPath: 'apphost/modules/other' } };
    expect(renderGoIndexMarkdown([redisDoc, other], base)).toContain(
      'Modules are imported as `apphost/modules/aspire`, `apphost/modules/other`.'
    );
  });

  test('tolerates an empty module list', () => {
    const empty = renderGoIndexMarkdown([], base);
    expect(empty).toContain('# Go API Reference');
    expect(empty).not.toContain('## Modules');
  });

  test('prefixes every link with the site base', () => {
    const prefixed = renderGoIndexMarkdown([redisDoc], '/docs/');
    expect(bulletEntries(prefixed, 'Modules')[0].href).toBe('/docs/reference/api/go/aspire.hosting.redis.md');
  });
});

describe('Go module markdown', () => {
  const markdown = renderGoModuleMarkdown(redisDoc, base);

  test('states the module metadata, import path and experimental note', () => {
    expect(markdown.startsWith('# Aspire.Hosting.Redis\n')).toBe(true);
    expect(markdown).toContain(`> ${GO_EXPERIMENTAL_NOTE}`);
    expect(markdown).toContain('- Module: `Aspire.Hosting.Redis`');
    expect(markdown).toContain('- Version: `13.6.0`');
    expect(markdown).toContain('- Import path: `apphost/modules/aspire`');
    expect(markdown).toContain('- Source: [GitHub](https://github.com/microsoft/aspire/tree/abc1234)');
    expect(markdown).toContain('- Functions: `6`');
    expect(markdown).toContain('- Types: `6`');
  });

  test('groups handles, DTOs, enums, functions and exported values in that order', () => {
    expect(headingsOutsideFences(markdown)).toEqual([
      '# Aspire.Hosting.Redis',
      '## Handles',
      '## DTOs',
      '## Enums',
      '## Functions',
      '## Exported values',
    ]);
  });

  test('lists handles with their kind, marker flag, member count and summary', () => {
    const entries = bulletEntries(markdown, 'Handles');
    expect(entries.map((entry) => entry.name)).toEqual([
      'InputCollection',
      'RedisResource',
      'Resource',
      'ResourceWithEnvironment',
    ]);

    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    expect(byName.get('RedisResource')).toEqual({
      name: 'RedisResource',
      href: `${redisModuleHref}/redisresource.md`,
      // Nine capabilities, but `SetPort` is the setter of the `Port` getter: one property.
      tail: ' -- `handle` - 8 members -- Represents a Redis container resource.',
    });
    expect(byName.get('Resource')?.tail).toBe(' -- `interface` `marker` - 0 members -- Any resource.');
    expect(byName.get('ResourceWithEnvironment')?.tail).toBe(
      ' -- `interface` - 1 members -- Resources that accept environment variables.'
    );
    // Synthesized helpers count as members.
    expect(byName.get('InputCollection')?.tail).toBe(' -- `handle` - 1 members -- A collection of inputs.');
  });

  test('lists DTOs and enums', () => {
    expect(bulletEntries(markdown, 'DTOs')).toEqual([
      {
        name: 'RedisOptions',
        href: `${redisModuleHref}/redisoptions.md`,
        tail: ' -- `struct` - 3 fields -- Options for Redis.',
      },
    ]);
    expect(bulletEntries(markdown, 'Enums')).toEqual([
      {
        name: 'RedisMode',
        href: `${redisModuleHref}/redismode.md`,
        tail: ' -- `enum` - 2 values -- Redis modes.',
      },
    ]);
  });

  test('groups standalone functions by receiver, package functions first', () => {
    const entries = bulletEntries(markdown, 'Functions');
    expect(entries.map((entry) => entry.name)).toEqual([
      'CreateRedisBuilder',
      'AddRedis',
      'ConfigureRedis',
      'WithDataVolume',
      'WithModule',
      'WithEnvironment',
    ]);
    expect(entries[0]).toEqual({
      name: 'CreateRedisBuilder',
      href: `${redisModuleHref}/createredisbuilder.md`,
      tail: ' -- `function` -- Creates a builder.',
    });
    expect(entries[1]).toEqual({
      name: 'AddRedis',
      href: `${redisModuleHref}/addredis.md`,
      tail: ' -- `method` - on `DistributedApplicationBuilder` -- Adds a Redis container resource.',
    });
    // Property-style capabilities (dotted qualifiedName) are never listed as functions.
    expect(entries.map((entry) => entry.name)).not.toContain('Host');
  });

  test('renders exported values on the module page only', () => {
    expect(sectionOf(markdown, 'Exported values')).toBe(
      '- `RedisModules.Json`: `string` = `"redis/redis-stack"` -- The JSON module.'
    );
    expect(renderGoModuleMarkdown(hostingDoc, base)).not.toContain('## Exported values');
  });

  test('every list entry follows the " -- " bullet grammar the CLI expects', () => {
    for (const title of ['Handles', 'DTOs', 'Enums', 'Functions']) {
      const entries = bulletEntries(markdown, title);
      expect(entries.length, title).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.href, entry.name).toMatch(/^\/reference\/api\/go\/aspire\.hosting\.redis\/[a-z0-9-]+\.md$/);
        expect(entry.tail.startsWith(' -- '), entry.name).toBe(true);
      }
    }
    expect(markdown).not.toMatch(/[·—–…]/);
  });

  test('links same-name standalone functions to distinct pages', () => {
    const collisions: GoApiDocument = {
      package: { name: 'Aspire.Hosting.Collisions', importPath: 'apphost/modules/aspire' },
      functions: [
        { name: 'WithDataVolume', qualifiedName: 'withDataVolume', kind: 'Method', receiver: 'RedisResource' },
        { name: 'WithDataVolume', qualifiedName: 'withDataVolume', kind: 'Method', receiver: 'PostgresServerResource' },
      ],
    };

    const hrefs = bulletEntries(renderGoModuleMarkdown(collisions, base), 'Functions').map((entry) => entry.href);
    expect(hrefs).toHaveLength(2);
    expect(new Set(hrefs).size).toBe(2);
  });

  test('prefixes every link with the site base', () => {
    const prefixed = renderGoModuleMarkdown(redisDoc, '/docs/');
    for (const entry of bulletEntries(prefixed, 'Handles')) {
      expect(entry.href.startsWith('/docs/reference/api/go/aspire.hosting.redis/')).toBe(true);
    }
  });

  test('drops the experimental note when the shared constant is emptied', async () => {
    vi.resetModules();
    vi.doMock('@utils/go-modules', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@utils/go-modules')>()),
      GO_EXPERIMENTAL_NOTE: '',
    }));

    try {
      const markdownModule = await import('@utils/go-api-markdown');
      expect(markdownModule.renderGoIndexMarkdown([redisDoc], base)).not.toContain('experimental');
      expect(markdownModule.renderGoModuleMarkdown(redisDoc, base)).not.toContain('experimental');
    } finally {
      vi.doUnmock('@utils/go-modules');
      vi.resetModules();
    }
  });
});

/* ---- Item pages -------------------------------------------------------- */

describe('Go handle markdown', () => {
  const markdown = renderGoItemMarkdown(redisDoc, redisResource, 'handle', base);

  test('defines the handle as an interface embedding its interfaces, without listing members', () => {
    expect(sectionOf(markdown, 'Definition')).toBe(
      [
        '```go',
        'type RedisResource interface {',
        '    Resource',
        '    ResourceWithEnvironment',
        '    ExternalType',
        '}',
        '```',
      ].join('\n')
    );
  });

  test('orders the sections and keeps every heading outside code fences', () => {
    expect(headingsOutsideFences(markdown)).toEqual([
      '# RedisResource',
      '## Remarks',
      '## Definition',
      '## Embeds',
      '## Properties',
      '## Methods',
    ]);
    expect(markdown).toContain('- Module: [Aspire.Hosting.Redis](/reference/api/go/aspire.hosting.redis.md)');
    expect(markdown).toContain('- Kind: `handle`');
    expect(markdown).not.toContain(GO_EXPERIMENTAL_NOTE);
  });

  test('links embedded interfaces declared in the same module and leaves others as code', () => {
    expect(sectionOf(markdown, 'Embeds')).toBe(
      [
        `- [\`Resource\`](${redisModuleHref}/resource.md)`,
        `- [\`ResourceWithEnvironment\`](${redisModuleHref}/resourcewithenvironment.md)`,
        '- `ExternalType`',
      ].join('\n')
    );
  });

  test('renders getters, getter/setter pairs and write-only setters as properties', () => {
    expect(sectionOf(markdown, 'Properties')).toBe(
      [
        '- `Host`: `string` `get` -- The host name.',
        '- `Port`: `*float64` `get/set`',
        '- `SetToken`(`string`) `set` -- Sets the token.',
      ].join('\n')
    );
  });

  test('links methods to member pages with their signature, and never lists properties there', () => {
    const methods = sectionOf(markdown, 'Methods');
    expect(methods).toContain(
      [
        `- [WithModule](${redisModuleHref}/redisresource/withmodule.md) -- \`method\` -- Adds a Redis module.`,
        '  ```go',
        '  WithModule(path string) RedisResource',
        '  ```',
      ].join('\n')
    );
    expect(methods.match(/^- \[/gm)?.length).toBe(5);
    expect(methods).not.toContain('Host');
    expect(methods).not.toContain('SetToken');
  });

  test('closes an unterminated fence in the remarks so later sections survive', () => {
    expect(hasDanglingFence(redisResource.remarks ?? '')).toBe(true);
    expect(hasDanglingFence(markdown)).toBe(false);
    expect(sectionOf(markdown, 'Remarks')).toBe(
      [
        'Chain calls on the builder:',
        '',
        '```go',
        'redis := builder.AddRedis("cache")',
        'redis.WithModule("x")',
        '```',
      ].join('\n')
    );
  });

  test('also closes an unterminated fence in a description', () => {
    const noisy: GoHandleType = { name: 'Noisy', description: 'Intro\n```\ncode without a closing fence' };
    const page = renderGoItemMarkdown({ package: { name: 'Noisy.Module' }, handleTypes: [noisy] }, noisy, 'handle', base);
    expect(hasDanglingFence(page)).toBe(false);
    expect(headingsOutsideFences(page)).toEqual(['# Noisy', '## Definition']);
  });

  test('renders hand-written SDK helpers as plain, unlinked entries', () => {
    const page = renderGoItemMarkdown(redisDoc, inputCollection, 'handle', base);
    expect(sectionOf(page, 'Methods')).toBe(
      [
        '- `Get` -- `method` -- Get returns the input with the specified name, or nil if no input matches.',
        '  ```go',
        '  Get(name string) (*Input, error)',
        '  ```',
      ].join('\n')
    );
    expect(page).not.toContain('](/reference/api/go/aspire.hosting.redis/inputcollection/get.md)');
  });

  test('interface handles list the types they apply to', () => {
    const page = renderGoItemMarkdown(redisDoc, resourceWithEnvironment, 'handle', base);
    expect(page).toContain('- Kind: `interface`');
    expect(sectionOf(page, 'Applies to')).toBe(
      ['- `ContainerResource`', `- [\`RedisResource\`](${redisModuleHref}/redisresource.md)`].join('\n')
    );
    expect(sectionOf(page, 'Embeds')).toBe(`- [\`Resource\`](${redisModuleHref}/resource.md)`);
  });

  test('marker handles are an empty interface without member sections', () => {
    const page = renderGoItemMarkdown(redisDoc, resource, 'handle', base);
    expect(headingsOutsideFences(page)).toEqual(['# Resource', '## Definition']);
    expect(sectionOf(page, 'Definition')).toBe('```go\ntype Resource interface{}\n```');
    expect(page).toContain('- Kind: `interface`');
  });
});

describe('Go DTO and enum markdown', () => {
  test('DTO pages define a struct with json tags and list its fields', () => {
    const markdown = renderGoItemMarkdown(redisDoc, redisOptions, 'dto', base);
    expect(headingsOutsideFences(markdown)).toEqual(['# RedisOptions', '## Definition', '## Fields']);
    expect(markdown).toContain('- Kind: `struct`');
    expect(sectionOf(markdown, 'Definition')).toBe(
      [
        '```go',
        'type RedisOptions struct {',
        '    Port    *float64    `json:"port"`',
        '    Modules []RedisMode `json:"modules"`',
        '    OnReady func()      `json:"onReady"`',
        '}',
        '```',
      ].join('\n')
    );
    expect(sectionOf(markdown, 'Fields')).toBe(
      [
        '- `Port`: `*float64` `optional` -- The host port.',
        `- \`Modules\`: [\`[]RedisMode\`](${redisModuleHref}/redismode.md)`,
        '- `OnReady`: `func()` `callback` -- Called when ready.',
      ].join('\n')
    );
  });

  test('enum pages define a string type with a const block and list its values', () => {
    const markdown = renderGoItemMarkdown(redisDoc, redisMode, 'enum', base);
    expect(headingsOutsideFences(markdown)).toEqual(['# RedisMode', '## Definition', '## Values']);
    expect(markdown).toContain('- Kind: `enum`');
    expect(sectionOf(markdown, 'Definition')).toBe(
      [
        '```go',
        'type RedisMode string',
        '',
        'const (',
        '    RedisModeStandalone RedisMode = "Standalone"',
        '    RedisModeCluster    RedisMode = "Cluster"',
        ')',
        '```',
      ].join('\n')
    );
    expect(sectionOf(markdown, 'Values')).toBe(
      ['- `RedisModeStandalone` = `"Standalone"` -- A single node.', '- `RedisModeCluster` = `"Cluster"`'].join('\n')
    );
  });
});

describe('Go standalone function markdown', () => {
  test('defines a method-style function on its receiver and documents parameters, options and returns', () => {
    const markdown = renderGoItemMarkdown(redisDoc, addRedis, 'function', base);
    expect(headingsOutsideFences(markdown)).toEqual([
      '# AddRedis',
      '## Definition',
      '## Parameters',
      '## Options',
      '## Returns',
      '## Applies to',
    ]);
    expect(markdown).toContain('- Kind: `method`');
    expect(markdown).toContain('- Defined on: `DistributedApplicationBuilder`');
    expect(sectionOf(markdown, 'Definition')).toBe(
      [
        '```go',
        'func (DistributedApplicationBuilder) AddRedis(',
        '    name string,',
        '    options ...*AddRedisOptions,',
        ') RedisResource',
        '```',
      ].join('\n')
    );
    expect(sectionOf(markdown, 'Parameters')).toBe(
      [
        '- `name` (`string`) -- The resource name.',
        '- `options` (`...*AddRedisOptions`) -- optional settings, see [Options](#options)',
      ].join('\n')
    );
    expect(sectionOf(markdown, 'Options')).toBe(
      [
        'Optional parameters are passed in a trailing `options ...*AddRedisOptions` argument.',
        '',
        '- `Port` (`*float64`) -- The host port.',
        `- \`Mode\` ([\`*RedisMode\`](${redisModuleHref}/redismode.md))`,
      ].join('\n')
    );
    expect(sectionOf(markdown, 'Returns')).toBe(
      [
        `[\`RedisResource\`](${redisModuleHref}/redisresource.md) -- A builder for the Redis resource.`,
        '',
        'Returns a handle; failures surface later via `Err()`.',
      ].join('\n')
    );
    expect(sectionOf(markdown, 'Applies to')).toBe('- `DistributedApplicationBuilder`');
  });

  test('links the receiver and applies-to types that live in the same module', () => {
    const markdown = renderGoItemMarkdown(redisDoc, withModule, 'function', base);
    expect(markdown).toContain(`- Defined on: [\`RedisResource\`](${redisModuleHref}/redisresource.md)`);
    expect(sectionOf(markdown, 'Applies to')).toBe(`- [\`RedisResource\`](${redisModuleHref}/redisresource.md)`);
  });

  test('receiver-less package functions use "func Name" and have no "Defined on"', () => {
    const markdown = renderGoItemMarkdown(redisDoc, createRedisBuilder, 'function', base);
    expect(markdown).toContain('- Kind: `function`');
    expect(markdown).not.toContain('- Defined on:');
    expect(sectionOf(markdown, 'Definition')).toBe(
      '```go\nfunc CreateRedisBuilder() (DistributedApplicationBuilder, error)\n```'
    );
    expect(sectionOf(markdown, 'Returns')).toBe(
      ['`(DistributedApplicationBuilder, error)`', '', 'Returns `(DistributedApplicationBuilder, error)`.'].join('\n')
    );
  });

  test('a direct options type is referenced as the existing struct', () => {
    const markdown = renderGoItemMarkdown(redisDoc, configureRedis, 'function', base);
    expect(sectionOf(markdown, 'Options')).toBe(
      `Optional parameters are passed as the existing [\`*RedisOptions\`](${redisModuleHref}/redisoptions.md) struct.`
    );
    expect(sectionOf(markdown, 'Parameters')).toBe(
      '- `options` (`...*RedisOptions`) -- optional settings, see [Options](#options)'
    );
  });
});

/* ---- Member pages ------------------------------------------------------ */

describe('Go member markdown', () => {
  test('documents the definition, signature, parameters and owning handle', () => {
    const markdown = renderGoMemberMarkdownPage(redisDoc, redisResource, withModule, base);
    expect(markdown.startsWith('# RedisResource.WithModule\n')).toBe(true);
    expect(markdown).toContain('- Module: [Aspire.Hosting.Redis](/reference/api/go/aspire.hosting.redis.md)');
    expect(markdown).toContain(`- Defined on: [RedisResource](${redisModuleHref}/redisresource.md)`);
    expect(markdown).toContain('- Kind: `method`');
    expect(markdown).toContain('Adds a Redis module.');
    expect(headingsOutsideFences(markdown)).toEqual([
      '# RedisResource.WithModule',
      '## Definition',
      '## Signature',
      '## Parameters',
      '## Returns',
      '## Defined on',
    ]);
    expect(sectionOf(markdown, 'Definition')).toBe(
      [
        '```go',
        'type RedisResource interface {',
        '    // ... omitted for brevity',
        '    WithModule(path string) RedisResource',
        '}',
        '```',
      ].join('\n')
    );
    expect(sectionOf(markdown, 'Signature')).toBe('```go\nWithModule(path string) RedisResource\n```');
    expect(sectionOf(markdown, 'Parameters')).toBe('- `path` (`string`) -- The module path.');
    expect(sectionOf(markdown, 'Defined on')).toBe(`- [RedisResource](${redisModuleHref}/redisresource.md) -- \`handle\``);
    expect(markdown).not.toContain(GO_EXPERIMENTAL_NOTE);
  });

  test('lists optional parameters as an options struct with callback signatures', () => {
    const markdown = renderGoMemberMarkdownPage(redisDoc, redisResource, withDataVolume, base);
    expect(sectionOf(markdown, 'Parameters')).toBe(
      '- `opts` (`...*WithDataVolumeOptions`) -- optional settings, see [Options](#options)'
    );
    expect(sectionOf(markdown, 'Options')).toBe(
      [
        'Optional parameters are passed in a trailing `opts ...*WithDataVolumeOptions` argument.',
        '',
        '- `Name` (`*string`) -- The volume name.',
        '- `Configure` (`func(volume Volume) error`) `callback` -- Configures the volume.',
      ].join('\n')
    );
  });

  test('wraps multi-parameter signatures one parameter per line', () => {
    const markdown = renderGoMemberMarkdownPage(redisDoc, resourceWithEnvironment, withEnvironment, base);
    expect(sectionOf(markdown, 'Signature')).toBe(
      [
        '```go',
        'WithEnvironment(',
        '    name string,',
        '    value string,',
        ') ResourceWithEnvironment',
        '```',
      ].join('\n')
    );
    expect(sectionOf(markdown, 'Defined on')).toBe(
      `- [ResourceWithEnvironment](${redisModuleHref}/resourcewithenvironment.md) -- \`interface\``
    );
  });

  test.each([
    ['deferred', withModule, 'Returns a handle; failures surface later via `Err()`.'],
    ['returned tuple', ping, 'Returns `(bool, error)`.'],
    ['error only', close, 'Returns `error`.'],
    ['none', count, 'Returns `int`; no error is reported.'],
  ] as Array<[string, GoFunction, string]>)('states the %s error model in plain words', (_label, method, sentence) => {
    const markdown = renderGoMemberMarkdownPage(redisDoc, redisResource, method, base);
    expect(sectionOf(markdown, 'Returns').endsWith(sentence)).toBe(true);
  });

  test('keeps the documented return text next to the return type', () => {
    expect(sectionOf(renderGoMemberMarkdownPage(redisDoc, redisResource, ping, base), 'Returns')).toBe(
      ['`(bool, error)` -- Whether the server answered.', '', 'Returns `(bool, error)`.'].join('\n')
    );
  });

  test('closes unterminated fences in member remarks', () => {
    const noisy: GoFunction = {
      ...withModule,
      remarks: 'Example:\n\n```go\nredis.WithModule("x")',
    };
    const markdown = renderGoMemberMarkdownPage(redisDoc, redisResource, noisy, base);
    expect(hasDanglingFence(markdown)).toBe(false);
    expect(headingsOutsideFences(markdown)).toContain('## Defined on');
  });

  test('prefixes every link with the site base', () => {
    const markdown = renderGoMemberMarkdownPage(redisDoc, redisResource, withModule, '/docs/');
    expect(markdown).toContain('- Module: [Aspire.Hosting.Redis](/docs/reference/api/go/aspire.hosting.redis.md)');
    expect(markdown).toContain('- Defined on: [RedisResource](/docs/reference/api/go/aspire.hosting.redis/redisresource.md)');
  });
});

/* ---- Route handlers against the real seed ----------------------------- */

type Props = Record<string, unknown>;

function context(props?: Props): Parameters<APIRoute>[0] {
  return { props } as unknown as Parameters<APIRoute>[0];
}

async function read(responsePromise: Response | Promise<Response>): Promise<string> {
  const response = await responsePromise;
  expect(response.headers.get('content-type')).toContain('text/markdown');
  return response.text();
}

async function moduleProps(moduleSlug: string): Promise<Props> {
  const route = (await modulePaths()).find(({ params }) => params.module === moduleSlug);
  expect(route, `Expected a module route for ${moduleSlug}.`).toBeTruthy();
  return route!.props;
}

async function itemProps(moduleSlug: string, itemSlug: string): Promise<Props> {
  const route = (await itemPaths()).find(({ params }) => params.module === moduleSlug && params.item === itemSlug);
  expect(route, `Expected an item route for ${moduleSlug}/${itemSlug}.`).toBeTruthy();
  return route!.props;
}

async function memberProps(moduleSlug: string, itemSlug: string, memberSlug: string): Promise<Props> {
  const route = (await memberPaths()).find(
    ({ params }) => params.module === moduleSlug && params.item === itemSlug && params.member === memberSlug
  );
  expect(route, `Expected a member route for ${moduleSlug}/${itemSlug}/${memberSlug}.`).toBeTruthy();
  return route!.props;
}

describe('Go markdown routes (real seed anchors)', () => {
  test('the index route lists modules and the experimental note', async () => {
    const markdown = await read(getIndex(context()));
    expect(markdown).toContain('# Go API Reference');
    expect(markdown).toContain(`> ${GO_EXPERIMENTAL_NOTE}`);
    expect(markdown).toContain('(/reference/api/go/aspire.hosting.redis.md)');
    expect(markdown).not.toMatch(/[·—]/);
  });

  test('the Aspire.Hosting.Redis module route lists its handles, functions and exported values', async () => {
    const markdown = await read(getModule(context(await moduleProps('aspire.hosting.redis'))));
    expect(markdown).toContain('# Aspire.Hosting.Redis');
    expect(markdown).toContain('- Import path: `apphost/modules/aspire`');
    expect(markdown).toContain(`> ${GO_EXPERIMENTAL_NOTE}`);
    expect(markdown).toContain('[RedisResource](/reference/api/go/aspire.hosting.redis/redisresource.md)');
    expect(markdown).toContain('[AddRedis](/reference/api/go/aspire.hosting.redis/addredis.md)');
    expect(markdown).toContain('## Exported values');
    expect(markdown).toContain('`RedisModules.');
  });

  test('CreateBuilder is a receiver-less function that returns (T, error)', async () => {
    const markdown = await read(getItem(context(await itemProps('aspire.hosting', 'createbuilder'))));
    expect(markdown).toContain('# CreateBuilder');
    expect(markdown).toContain('- Kind: `function`');
    expect(markdown).toContain('```go\nfunc CreateBuilder(');
    expect(markdown).toMatch(/Returns `\(DistributedApplicationBuilder, error\)`\./);
  });

  test('AddRedis is a deferred method on the application builder', async () => {
    const markdown = await read(getItem(context(await itemProps('aspire.hosting.redis', 'addredis'))));
    expect(markdown).toContain('# AddRedis');
    expect(markdown).toContain('- Kind: `method`');
    expect(markdown).toContain('func (DistributedApplicationBuilder) AddRedis(');
    expect(markdown).toContain('Returns a handle; failures surface later via `Err()`.');
    expect(markdown).toContain('## Options');
  });

  test('RedisResource lists properties, methods that link to member pages, and embedded interfaces', async () => {
    const markdown = await read(getItem(context(await itemProps('aspire.hosting.redis', 'redisresource'))));
    expect(markdown).toContain('# RedisResource');
    expect(markdown).toContain('```go\ntype RedisResource interface {');
    expect(markdown).toContain('## Embeds');
    expect(markdown).toContain('## Properties');
    expect(markdown).toContain('## Methods');
    expect(markdown).toContain('(/reference/api/go/aspire.hosting.redis/redisresource/withmodule.md)');
  });

  test('InteractionInputCollection lists its synthesized helpers without pages', async () => {
    const markdown = await read(getItem(context(await itemProps('aspire.hosting', 'interactioninputcollection'))));
    expect(markdown).toContain('## Methods');
    expect(markdown).toMatch(/^- `Get` -- `method`/m);
    expect(markdown).not.toContain('/interactioninputcollection/get.md');
  });

  test('CertificateTrustScope is rendered as a string type with a const block', async () => {
    const markdown = await read(getItem(context(await itemProps('aspire.hosting', 'certificatetrustscope'))));
    expect(markdown).toContain('- Kind: `enum`');
    expect(markdown).toContain('```go\ntype CertificateTrustScope string\n\nconst (');
    expect(markdown).toContain('CertificateTrustScope = "Append"');
    expect(markdown).toContain('## Values');
  });

  test('the WithModule member route documents the method on RedisResource', async () => {
    const markdown = await read(
      getMember(context(await memberProps('aspire.hosting.redis', 'redisresource', 'withmodule')))
    );
    expect(markdown).toContain('# RedisResource.WithModule');
    expect(markdown).toContain('## Signature');
    expect(markdown).toContain('- Defined on: [RedisResource](/reference/api/go/aspire.hosting.redis/redisresource.md)');
    expect(markdown).toContain('Returns a handle; failures surface later via `Err()`.');
  });
});

describe('Go markdown pages across the whole seed', () => {
  test('every page has balanced code fences and links only to existing routes', async () => {
    const modules = await modulePaths();
    const items = await itemPaths();
    const members = await memberPaths();

    const validPaths = new Set<string>(['/reference/api/go.md']);
    for (const { params } of modules) validPaths.add(`/reference/api/go/${params.module}.md`);
    for (const { params } of items) validPaths.add(`/reference/api/go/${params.module}/${params.item}.md`);
    for (const { params } of members) {
      validPaths.add(`/reference/api/go/${params.module}/${params.item}/${params.member}.md`);
    }

    const pages: Array<[string, string]> = [['index', await read(getIndex(context()))]];
    for (const { params, props } of modules) {
      pages.push([`${params.module}`, renderGoModuleMarkdown(props.pkg, base)]);
    }
    for (const { params, props } of items) {
      pages.push([`${params.module}/${params.item}`, renderGoItemMarkdown(props.pkg, props.item, props.itemKind, base)]);
    }
    for (const { params, props } of members) {
      pages.push([
        `${params.module}/${params.item}/${params.member}`,
        renderGoMemberMarkdownPage(props.pkg, props.parentType, props.method, base),
      ]);
    }

    const dangling: string[] = [];
    const missingTitle: string[] = [];
    const brokenLinks: string[] = [];
    let checkedLinks = 0;
    for (const [label, markdown] of pages) {
      if (hasDanglingFence(markdown)) dangling.push(label);
      if (!markdown.startsWith('# ')) missingTitle.push(label);
      for (const match of markdown.matchAll(/\]\((\/reference\/api\/go[^)\s]*)\)/g)) {
        checkedLinks++;
        if (!validPaths.has(match[1])) brokenLinks.push(`${label} -> ${match[1]}`);
      }
    }

    expect(pages.length).toBeGreaterThan(modules.length + items.length + members.length);
    expect(checkedLinks).toBeGreaterThan(pages.length);
    expect(dangling).toEqual([]);
    expect(missingTitle).toEqual([]);
    expect(brokenLinks.slice(0, 10)).toEqual([]);
  });
});
