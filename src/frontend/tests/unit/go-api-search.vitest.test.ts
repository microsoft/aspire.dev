import { expect, test } from 'vitest';

import { buildGoApiSearchIndex } from '../../src/utils/go-api-search';
import { formatGoApiSearchStats, getGoApiSearchStats } from '../../src/utils/go-api-search-stats';
import type { GoApiDocument } from '../../src/utils/go-modules';

const redisDocument: GoApiDocument = {
  package: {
    name: 'Aspire.Hosting.Redis',
    version: '13.6.0',
    language: 'go',
    importPath: 'apphost/modules/aspire',
  },
  functions: [
    {
      name: 'WithDataVolume',
      capabilityId: 'Aspire.Hosting.Redis/withDataVolume',
      qualifiedName: 'withDataVolume',
      kind: 'Method',
      receiver: 'RedisResource',
      signature: 'WithDataVolume(opts ...*WithDataVolumeOptions) RedisResource',
      description: 'Adds a named volume for the data folder to a Redis container resource.',
      appliesTo: ['RedisResource'],
      options: {
        typeName: 'WithDataVolumeOptions',
        fields: [{ name: 'Name', type: 'string' }],
      },
      returnType: 'RedisResource',
      errorModel: 'deferred',
    },
    {
      name: 'AddRedis',
      capabilityId: 'Aspire.Hosting.Redis/addRedis',
      qualifiedName: 'addRedis',
      kind: 'Method',
      receiver: 'DistributedApplicationBuilder',
      signature: 'AddRedis(name string) RedisResource',
      description: 'Adds a Redis container to the application model.',
      parameters: [{ name: 'name', type: 'string' }],
      returnType: 'RedisResource',
      errorModel: 'deferred',
    },
  ],
  handleTypes: [
    {
      name: 'RedisResource',
      fullName: 'Aspire.Hosting.Redis.RedisResource',
      kind: 'handle',
      capabilities: [
        {
          name: 'Host',
          kind: 'PropertyGetter',
          receiver: 'RedisResource',
          signature: 'Host() EndpointReferenceExpression',
          description: 'Gets the Host property',
        },
        {
          name: 'SetPasswordParameter',
          kind: 'PropertySetter',
          receiver: 'RedisResource',
          signature: 'SetPasswordParameter(value ParameterResource) error',
        },
        {
          name: 'WithDataVolume',
          capabilityId: 'Aspire.Hosting.Redis/withDataVolume',
          qualifiedName: 'withDataVolume',
          kind: 'Method',
          receiver: 'RedisResource',
          signature: 'WithDataVolume(opts ...*WithDataVolumeOptions) RedisResource',
          description: 'Adds a named volume for the data folder to a Redis container resource.',
        },
        {
          name: 'WithModule',
          capabilityId: 'Aspire.Hosting.Redis/withModule',
          qualifiedName: 'RedisResource.withModule',
          kind: 'InstanceMethod',
          receiver: 'RedisResource',
          signature: 'WithModule(module string) RedisResource',
          description: 'Loads a Redis module.',
          parameters: [{ name: 'module', type: 'string' }],
        },
      ],
    },
  ],
  dtoTypes: [
    {
      name: 'RedisModule',
      fullName: 'Aspire.Hosting.Redis.RedisModule',
      kind: 'dto',
      fields: [{ name: 'Name', jsonName: 'name', type: 'string' }],
    },
  ],
  enumTypes: [
    {
      name: 'RedisMode',
      fullName: 'Aspire.Hosting.Redis.RedisMode',
      kind: 'enum',
      members: [
        { name: 'RedisModeStandalone', value: 'Standalone' },
        { name: 'RedisModeCluster', value: 'Cluster' },
      ],
    },
  ],
};

test('buildGoApiSearchIndex produces canonical hrefs for standalone functions and handle members', () => {
  const index = buildGoApiSearchIndex([redisDocument]);

  expect(index).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        n: 'AddRedis',
        k: 'method',
        t: 'DistributedApplicationBuilder',
        h: '/reference/api/go/aspire.hosting.redis/addredis/',
        v: '13.6.0',
      }),
      expect.objectContaining({
        n: 'WithDataVolume',
        k: 'method',
        t: 'RedisResource',
        h: '/reference/api/go/aspire.hosting.redis/withdatavolume/',
        v: '13.6.0',
      }),
      expect.objectContaining({
        n: 'Host',
        k: 'property',
        t: 'RedisResource',
        h: '/reference/api/go/aspire.hosting.redis/redisresource/#host',
        m: true,
        v: '13.6.0',
      }),
      expect.objectContaining({
        n: 'SetPasswordParameter',
        k: 'property',
        h: '/reference/api/go/aspire.hosting.redis/redisresource/#setpasswordparameter',
        m: true,
      }),
      expect.objectContaining({
        n: 'WithModule',
        k: 'method',
        t: 'RedisResource',
        h: '/reference/api/go/aspire.hosting.redis/redisresource/withmodule/',
        m: true,
      }),
    ])
  );
});

test('buildGoApiSearchIndex lists each capability once when a standalone function covers the handle method', () => {
  const index = buildGoApiSearchIndex([redisDocument]);

  expect(index.filter((entry) => entry.n === 'WithDataVolume')).toHaveLength(1);
});

test('buildGoApiSearchIndex indexes handles, structs and enums with their own kinds', () => {
  const index = buildGoApiSearchIndex([redisDocument], '/base/');

  expect(index).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        n: 'RedisResource',
        k: 'handle',
        h: '/base/reference/api/go/aspire.hosting.redis/redisresource/',
      }),
      expect.objectContaining({
        n: 'RedisModule',
        k: 'struct',
        s: 'Struct with 1 fields',
        h: '/base/reference/api/go/aspire.hosting.redis/redismodule/',
      }),
      expect.objectContaining({
        n: 'RedisMode',
        k: 'enum',
        s: 'Enum: RedisModeStandalone, RedisModeCluster',
        h: '/base/reference/api/go/aspire.hosting.redis/redismode/',
      }),
    ])
  );
});

test('buildGoApiSearchIndex marks interface handles and keeps the language-specific detail', () => {
  const index = buildGoApiSearchIndex([
    {
      package: { name: 'Aspire.Hosting', version: '13.6.0' },
      handleTypes: [
        { name: 'ResourceWithEnvironment', isInterface: true },
        { name: 'IResourceMarker', isInterface: true, isMarker: true },
      ],
    },
  ]);

  expect(index.find((entry) => entry.n === 'ResourceWithEnvironment')).toMatchObject({
    k: 'interface',
    s: 'Handle type (interface)',
  });
  expect(index.find((entry) => entry.n === 'IResourceMarker')).toMatchObject({
    k: 'interface',
    s: 'Handle type (interface, marker)',
  });
});

test('buildGoApiSearchIndex tells same-named standalone functions apart by receiver', () => {
  const index = buildGoApiSearchIndex([
    {
      package: { name: 'Aspire.Hosting.Redis', version: '13.6.0' },
      functions: [
        { name: 'WithHostPort', kind: 'Method', receiver: 'RedisResource', signature: 'WithHostPort(port int) RedisResource', parameters: [{ name: 'port', type: 'int' }] },
        { name: 'WithHostPort', kind: 'Method', receiver: 'RedisInsightResource', signature: 'WithHostPort(port int) RedisInsightResource', parameters: [{ name: 'port', type: 'int' }] },
      ],
    },
  ]);

  expect(index.map((entry) => entry.f)).toEqual([
    'RedisResource.WithHostPort(port int) RedisResource',
    'RedisInsightResource.WithHostPort(port int) RedisInsightResource',
  ]);
  expect(new Set(index.map((entry) => entry.h)).size).toBe(2);
});

test('buildGoApiSearchIndex handles a standalone function without a receiver', () => {
  const index = buildGoApiSearchIndex([
    {
      package: { name: 'Aspire.Hosting', version: '13.6.0' },
      functions: [
        { name: 'CreateBuilder', kind: 'Method', signature: 'CreateBuilder() (DistributedApplicationBuilder, error)' },
      ],
    },
  ]);

  expect(index).toEqual([
    expect.objectContaining({
      n: 'CreateBuilder',
      f: 'CreateBuilder() (DistributedApplicationBuilder, error)',
      k: 'function',
      h: '/reference/api/go/aspire.hosting/createbuilder/',
    }),
  ]);
  expect(index[0]).not.toHaveProperty('t');
});

test('getGoApiSearchStats counts capabilities from indexed members and properties', () => {
  const index = buildGoApiSearchIndex([redisDocument]);

  expect(getGoApiSearchStats(index)).toEqual({
    packageCount: 1,
    capabilityCount: 5,
    typeCount: 3,
  });
  expect(getGoApiSearchStats(index, new Set(['0.0.0']))).toEqual({
    packageCount: 0,
    capabilityCount: 0,
    typeCount: 0,
  });
  expect(formatGoApiSearchStats(getGoApiSearchStats(index))).toBe(
    '5 capabilities and 3 types across 1 modules'
  );
});
