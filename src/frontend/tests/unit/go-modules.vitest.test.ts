import { describe, expect, test, vi } from 'vitest';
import {
  GO_PACKAGE_FUNCTIONS_GROUP,
  buildGoDtoDefinition,
  buildGoEnumDefinition,
  buildGoFunctionDefinition,
  buildGoHandleDefinition,
  buildGoHandleMemberDefinition,
  buildGoMemberDefinition,
  closeUnclosedCodeFences,
  countGoHandleMembers,
  describeGoErrorModel,
  formatGoSignature,
  getGoHandleAppliesTo,
  getGoImportPaths,
  getGoOptionsParameterName,
  getGoPropertyValueType,
  getGoTypeHref,
  goItemHref,
  goModuleHref,
  goModuleSlug,
  groupGoFunctionsByReceiver,
  parseGoTypeReference,
  type GoApiDocument,
  type GoFunction,
  type GoHandleType,
} from '@utils/go-modules';

vi.mock('astro:content', () => ({ getCollection: vi.fn() }));

describe('Go error model wording', () => {
  test('deferred results are checked later through Err()', () => {
    expect(describeGoErrorModel({ errorModel: 'deferred', returnType: 'RedisResource' })).toBe(
      'Returns a handle; failures surface later via `Err()`.'
    );
  });

  test('returned results are reported as a (T, error) tuple', () => {
    expect(
      describeGoErrorModel({ errorModel: 'returned', returnType: '(DistributedApplicationBuilder, error)' })
    ).toBe('Returns `(DistributedApplicationBuilder, error)`.');
    expect(describeGoErrorModel({ errorModel: 'returned', returnType: 'string' })).toBe(
      'Returns `(string, error)`.'
    );
    expect(describeGoErrorModel({ errorModel: 'returned' })).toBe('Returns `(T, error)`.');
  });

  test('a bare error return type always reads as "Returns `error`"', () => {
    expect(describeGoErrorModel({ errorModel: 'returned', returnType: 'error' })).toBe('Returns `error`.');
    expect(describeGoErrorModel({ errorModel: 'none', returnType: 'error' })).toBe('Returns `error`.');
    expect(describeGoErrorModel({ returnType: ' error ' })).toBe('Returns `error`.');
  });

  test('callables without an error model say that no error is reported', () => {
    expect(describeGoErrorModel({ errorModel: 'none', returnType: 'bool' })).toBe(
      'Returns `bool`; no error is reported.'
    );
    expect(describeGoErrorModel({ errorModel: 'none' })).toBe('No error is reported.');
    expect(describeGoErrorModel({})).toBe('No error is reported.');
  });
});

describe('closeUnclosedCodeFences', () => {
  test('leaves balanced fences and fence-free text alone', () => {
    const balanced = 'Intro\n\n```go\nx := 1\n```\n\nOutro';
    expect(closeUnclosedCodeFences(balanced)).toBe(balanced);
    expect(closeUnclosedCodeFences('No fences here.')).toBe('No fences here.');
    expect(closeUnclosedCodeFences('')).toBe('');
  });

  test('closes an odd fence with the same fence length', () => {
    expect(closeUnclosedCodeFences('Intro\n```go\nx := 1')).toBe('Intro\n```go\nx := 1\n```');
    expect(closeUnclosedCodeFences('Intro\n````\nx := 1\n\n')).toBe('Intro\n````\nx := 1\n````');
  });

  test('a shorter fence inside a longer one does not close it', () => {
    const nested = '````md\n```go\nx := 1\n```\n````';
    expect(closeUnclosedCodeFences(nested)).toBe(nested);
    expect(closeUnclosedCodeFences('````md\n```go\nx := 1\n```')).toBe('````md\n```go\nx := 1\n```\n````');
  });

  test('normalises CRLF text the same way', () => {
    expect(closeUnclosedCodeFences('Intro\r\n```\r\ncode')).toBe('Intro\r\n```\r\ncode\n```');
  });
});

describe('formatGoSignature', () => {
  test('keeps empty, parameterless and single-parameter signatures inline', () => {
    expect(formatGoSignature('')).toBe('');
    expect(formatGoSignature('Name')).toBe('Name');
    expect(formatGoSignature('Run() error')).toBe('Run() error');
    expect(formatGoSignature('WithModule(path string) RedisResource')).toBe('WithModule(path string) RedisResource');
    expect(formatGoSignature('CreateBuilder(options ...*CreateBuilderOptions) (DistributedApplicationBuilder, error)')).toBe(
      'CreateBuilder(options ...*CreateBuilderOptions) (DistributedApplicationBuilder, error)'
    );
  });

  test('puts every parameter on its own line, with the trailing comma gofmt expects', () => {
    expect(
      formatGoSignature('WithDataBindMount(source string, opts ...*WithDataBindMountOptions) RedisInsightResource')
    ).toBe(
      [
        'WithDataBindMount(',
        '    source string,',
        '    opts ...*WithDataBindMountOptions,',
        ') RedisInsightResource',
      ].join('\n')
    );
  });

  test('keeps a tuple return type after the wrapped parameter list', () => {
    expect(formatGoSignature('Get(a string, b int) (string, error)')).toBe(
      ['Get(', '    a string,', '    b int,', ') (string, error)'].join('\n')
    );
  });

  test('does not split inside callback, map or generic types', () => {
    expect(formatGoSignature('WithCallback(name string, cb func(ctx Context, n int) error) Resource')).toBe(
      ['WithCallback(', '    name string,', '    cb func(ctx Context, n int) error,', ') Resource'].join('\n')
    );
    expect(formatGoSignature('Merge(values map[string]string, extra int) error')).toBe(
      ['Merge(', '    values map[string]string,', '    extra int,', ') error'].join('\n')
    );
    expect(formatGoSignature('Of[T any](first T, second T) T')).toBe(
      ['Of[T any](', '    first T,', '    second T,', ') T'].join('\n')
    );
  });
});

describe('Go definition snippets', () => {
  test('handle definition embeds its interfaces and lists no members', () => {
    expect(buildGoHandleDefinition({ name: 'Resource' })).toBe('type Resource interface{}');
    expect(buildGoHandleDefinition({ name: 'Resource', implementedInterfaces: [] })).toBe('type Resource interface{}');
    expect(
      buildGoHandleDefinition({
        name: 'RedisResource',
        implementedInterfaces: ['Resource', 'ResourceWithEnvironment'],
      })
    ).toBe(['type RedisResource interface {', '    Resource', '    ResourceWithEnvironment', '}'].join('\n'));
  });

  test('DTO definition is a gofmt-aligned struct with json tags', () => {
    expect(
      buildGoDtoDefinition({
        name: 'CreateBuilderOptions',
        fields: [
          { name: 'Args', jsonName: 'args', type: '[]string' },
          { name: 'ProjectDirectory', jsonName: 'projectDirectory', type: '*string' },
        ],
      })
    ).toBe(
      [
        'type CreateBuilderOptions struct {',
        '    Args             []string `json:"args"`',
        '    ProjectDirectory *string  `json:"projectDirectory"`',
        '}',
      ].join('\n')
    );
  });

  test('DTO definition falls back to the field name for the tag and to any for the type', () => {
    expect(buildGoDtoDefinition({ name: 'Loose', fields: [{ name: 'Value' }] })).toBe(
      ['type Loose struct {', '    Value any `json:"Value"`', '}'].join('\n')
    );
    expect(buildGoDtoDefinition({ name: 'Empty' })).toBe('type Empty struct{}');
    expect(buildGoDtoDefinition({ name: 'Empty', fields: [] })).toBe('type Empty struct{}');
  });

  test('enum definition is a string type plus a const block of the Go constant names', () => {
    expect(
      buildGoEnumDefinition({
        name: 'CertificateTrustScope',
        members: [
          { name: 'CertificateTrustScopeNone', value: 'None' },
          { name: 'CertificateTrustScopeAppend', value: 'Append' },
        ],
      })
    ).toBe(
      [
        'type CertificateTrustScope string',
        '',
        'const (',
        '    CertificateTrustScopeNone   CertificateTrustScope = "None"',
        '    CertificateTrustScopeAppend CertificateTrustScope = "Append"',
        ')',
      ].join('\n')
    );
  });

  test('enum values are emitted as escaped Go string literals', () => {
    expect(buildGoEnumDefinition({ name: 'Quote', members: [{ name: 'QuoteOdd', value: 'a"b\\c' }] })).toBe(
      ['type Quote string', '', 'const (', '    QuoteOdd Quote = "a\\"b\\\\c"', ')'].join('\n')
    );
    expect(buildGoEnumDefinition({ name: 'Nothing' })).toBe('type Nothing string');
  });

  test('function definition uses the receiver type, or none for package functions', () => {
    expect(
      buildGoFunctionDefinition({
        name: 'AddRedis',
        receiver: 'DistributedApplicationBuilder',
        signature: 'AddRedis(name string, options ...*AddRedisOptions) RedisResource',
      })
    ).toBe(
      [
        'func (DistributedApplicationBuilder) AddRedis(',
        '    name string,',
        '    options ...*AddRedisOptions,',
        ') RedisResource',
      ].join('\n')
    );
    expect(
      buildGoFunctionDefinition({
        name: 'CreateBuilder',
        receiver: null,
        signature: 'CreateBuilder(options ...*CreateBuilderOptions) (DistributedApplicationBuilder, error)',
      })
    ).toBe('func CreateBuilder(options ...*CreateBuilderOptions) (DistributedApplicationBuilder, error)');
    expect(buildGoFunctionDefinition({ name: 'Bare' })).toBe('func Bare()');
  });

  test('member definition shows the method inside its parent interface', () => {
    expect(buildGoMemberDefinition('RedisResource', { name: 'WithModule', signature: 'WithModule(path string) RedisResource' })).toBe(
      ['type RedisResource interface {', '    // ... omitted for brevity', '    WithModule(path string) RedisResource', '}'].join('\n')
    );
    expect(
      buildGoMemberDefinition('RedisResource', {
        name: 'WithPassword',
        signature: 'WithPassword(password ParameterResource, opts ...*WithPasswordOptions) RedisResource',
      })
    ).toBe(
      [
        'type RedisResource interface {',
        '    // ... omitted for brevity',
        '    WithPassword(',
        '        password ParameterResource,',
        '        opts ...*WithPasswordOptions,',
        '    ) RedisResource',
        '}',
      ].join('\n')
    );
  });

  test('a method page shows a marker function with its receiver instead of inside the empty marker', () => {
    const marker = { name: 'Resource', isMarker: true };

    expect(
      buildGoHandleMemberDefinition(marker, {
        name: 'ExcludeFromManifest',
        receiver: 'Resource',
        signature: 'ExcludeFromManifest() Resource',
      })
    ).toBe('func (Resource) ExcludeFromManifest() Resource');
    expect(
      buildGoHandleMemberDefinition(marker, {
        name: 'WithRoleAssignments',
        receiver: 'Resource',
        signature: 'WithRoleAssignments(target AzureSearchResource, roles []AzureSearchRole) Resource',
      })
    ).toBe(
      [
        'func (Resource) WithRoleAssignments(',
        '    target AzureSearchResource,',
        '    roles []AzureSearchRole,',
        ') Resource',
      ].join('\n')
    );
  });

  test('a method page keeps the interface fence for handles that are not markers', () => {
    const method = { name: 'WithModule', receiver: 'RedisResource', signature: 'WithModule(path string) RedisResource' };

    expect(buildGoHandleMemberDefinition({ name: 'RedisResource' }, method)).toBe(
      buildGoMemberDefinition('RedisResource', method)
    );
    expect(buildGoHandleMemberDefinition({ name: 'RedisResource', isMarker: false }, method)).toBe(
      ['type RedisResource interface {', '    // ... omitted for brevity', '    WithModule(path string) RedisResource', '}'].join('\n')
    );
  });
});

describe('Go grouping and counting helpers', () => {
  test('functions are grouped by receiver with package functions first', () => {
    const groups = groupGoFunctionsByReceiver([
      { name: 'WithB', receiver: 'B' },
      { name: 'CreateBuilder' },
      { name: 'WithA', receiver: 'A' },
      { name: 'Init', receiver: null },
      { name: 'AddA', receiver: 'A' },
    ]);

    expect([...groups.keys()]).toEqual([GO_PACKAGE_FUNCTIONS_GROUP, 'A', 'B']);
    expect(groups.get(GO_PACKAGE_FUNCTIONS_GROUP)?.map((fn) => fn.name)).toEqual(['CreateBuilder', 'Init']);
    expect(groups.get('A')?.map((fn) => fn.name)).toEqual(['AddA', 'WithA']);
    expect(groups.get('B')?.map((fn) => fn.name)).toEqual(['WithB']);
    expect(groupGoFunctionsByReceiver([]).size).toBe(0);
  });

  test('a handle applies to the sorted union of its capabilities appliesTo', () => {
    const handle: GoHandleType = {
      name: 'ResourceWithEnvironment',
      capabilities: [
        { name: 'WithEnvironment', appliesTo: ['RedisResource', 'ContainerResource'] },
        { name: 'WithReference', appliesTo: ['ContainerResource', 'ProjectResource'] },
        { name: 'NoTargets' },
      ],
    };

    expect(getGoHandleAppliesTo(handle)).toEqual(['ContainerResource', 'ProjectResource', 'RedisResource']);
    expect(getGoHandleAppliesTo({ name: 'Plain' })).toEqual([]);
  });

  test('member counts merge a getter with its setter and include synthesized helpers', () => {
    const capabilities: GoFunction[] = [
      { name: 'Host', kind: 'PropertyGetter' },
      { name: 'Port', kind: 'PropertyGetter' },
      { name: 'SetPort', kind: 'PropertySetter' },
      { name: 'SetToken', kind: 'PropertySetter' },
      { name: 'WithThing', kind: 'Method' },
      { name: 'Start', kind: 'InstanceMethod' },
    ];

    expect(
      countGoHandleMembers({
        name: 'Sample',
        capabilities,
        synthesizedMembers: [{ name: 'Get' }, { name: 'Required' }],
      })
    ).toBe(7);
    expect(countGoHandleMembers({ name: 'Marker', isMarker: true })).toBe(0);
  });

  test('import paths are distinct, sorted and tolerate modules without one', () => {
    const modules: GoApiDocument[] = [
      { package: { name: 'B', importPath: 'apphost/modules/aspire' } },
      { package: { name: 'A', importPath: 'apphost/modules/aspire' } },
      { package: { name: 'C' } },
      { package: { name: 'D', importPath: 'apphost/modules/other' } },
    ];

    expect(getGoImportPaths(modules)).toEqual(['apphost/modules/aspire', 'apphost/modules/other']);
    expect(getGoImportPaths([])).toEqual([]);
  });
});

describe('Go callable helpers', () => {
  test('the options parameter name is read from the signature', () => {
    expect(
      getGoOptionsParameterName({
        signature: 'WithDataVolume(opts ...*WithDataVolumeOptions) RedisResource',
        options: { typeName: 'WithDataVolumeOptions' },
      })
    ).toBe('opts');
    expect(
      getGoOptionsParameterName({
        signature: 'CreateBuilder(options ...*CreateBuilderOptions) (DistributedApplicationBuilder, error)',
        options: { typeName: 'CreateBuilderOptions', isDirect: true },
      })
    ).toBe('options');
  });

  test('the options parameter name falls back to opts and never matches a longer type name', () => {
    expect(getGoOptionsParameterName({})).toBe('opts');
    expect(getGoOptionsParameterName({ signature: 'Run()' , options: { typeName: 'RunOptions' } })).toBe('opts');
    expect(
      getGoOptionsParameterName({
        signature: 'Run(extra ...*RunOptionsExtra)',
        options: { typeName: 'RunOptions' },
      })
    ).toBe('opts');
  });

  test('a property value type comes from the setter parameter or the getter return type', () => {
    expect(getGoPropertyValueType({ kind: 'PropertySetter', parameters: [{ name: 'value', type: 'string' }] })).toBe('string');
    expect(getGoPropertyValueType({ kind: 'PropertySetter', parameters: [] })).toBeUndefined();
    expect(getGoPropertyValueType({ kind: 'PropertyGetter', returnType: '(*float64, error)' })).toBe('*float64');
    expect(getGoPropertyValueType({ kind: 'PropertyGetter', returnType: 'ReferenceExpression' })).toBe(
      'ReferenceExpression'
    );
    expect(getGoPropertyValueType({ kind: 'PropertyGetter', returnType: '(*Dictionary[string, string], error)' })).toBe(
      '*Dictionary[string, string]'
    );
    expect(getGoPropertyValueType({ kind: 'PropertyGetter' })).toBeUndefined();
    expect(getGoPropertyValueType({ kind: 'PropertyGetter', returnType: '  ' })).toBeUndefined();
  });

  test('type references resolve only simple pointer, slice and plain identifiers', () => {
    expect(parseGoTypeReference('*RedisResource')).toEqual({ prefix: '*', name: 'RedisResource' });
    expect(parseGoTypeReference('[]DistributedApplicationBuilder')).toEqual({
      prefix: '[]',
      name: 'DistributedApplicationBuilder',
    });
    expect(parseGoTypeReference('[]*Foo')).toEqual({ prefix: '[]*', name: 'Foo' });
    expect(parseGoTypeReference(' string ')).toEqual({ prefix: '', name: 'string' });
    expect(parseGoTypeReference('map[string]string')).toBeUndefined();
    expect(parseGoTypeReference('*List[string]')).toBeUndefined();
    expect(parseGoTypeReference('func(a int) error')).toBeUndefined();
    expect(parseGoTypeReference('(Foo, error)')).toBeUndefined();
    expect(parseGoTypeReference('')).toBeUndefined();
    expect(parseGoTypeReference(undefined)).toBeUndefined();
  });
});

describe('Go links and shared constants', () => {
  const doc: GoApiDocument = {
    package: { name: 'Aspire.Hosting.Redis' },
    handleTypes: [{ name: 'RedisResource' }],
    dtoTypes: [{ name: 'RedisOptions' }],
    enumTypes: [{ name: 'RedisMode' }],
    functions: [{ name: 'AddRedis' }],
  };

  test('module and item hrefs are lowercase, module-local and honour the base path', () => {
    expect(goModuleSlug('Aspire.Hosting.Redis')).toBe('aspire.hosting.redis');
    expect(goModuleHref('', 'Aspire.Hosting.Redis')).toBe('/reference/api/go/aspire.hosting.redis/');
    expect(goModuleHref('/docs/', 'Aspire.Hosting.Redis')).toBe('/docs/reference/api/go/aspire.hosting.redis/');
    expect(goItemHref('', 'Aspire.Hosting.Redis', 'RedisResource')).toBe(
      '/reference/api/go/aspire.hosting.redis/redisresource/'
    );
  });

  test('type hrefs resolve handles, DTOs and enums of the same module only', () => {
    expect(getGoTypeHref('', doc, 'RedisResource')).toBe('/reference/api/go/aspire.hosting.redis/redisresource/');
    expect(getGoTypeHref('', doc, 'RedisOptions')).toBe('/reference/api/go/aspire.hosting.redis/redisoptions/');
    expect(getGoTypeHref('', doc, 'RedisMode')).toBe('/reference/api/go/aspire.hosting.redis/redismode/');
    expect(getGoTypeHref('', doc, 'ContainerResource')).toBeUndefined();
    expect(getGoTypeHref('/docs', doc, 'RedisResource')).toBe(
      '/docs/reference/api/go/aspire.hosting.redis/redisresource/'
    );
  });
});
