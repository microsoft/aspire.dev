import { expect, test } from 'vitest';

import {
  getTsItemSlug,
  getTsMethodSlug,
  getTsStandaloneFunctions,
  getTsTopLevelRouteItems,
} from '../../src/utils/ts-api-routes';

test('getTsItemSlug keeps unique names unchanged', () => {
  const doc = {
    handleTypes: [{ name: 'ContainerResource' }],
    functions: [{ name: 'AddRedis', qualifiedName: 'addRedis' }],
  };

  const items = getTsTopLevelRouteItems(doc);
  expect(getTsItemSlug(items[0], items)).toBe('containerresource');
});

test('getTsItemSlug disambiguates duplicate standalone functions', () => {
  const doc = {
    functions: [
      {
        name: 'WithHostPort',
        targetTypeId: 'Assembly/Aspire.Hosting.Postgres.PgAdminContainerResource',
        parameters: [{ type: 'System.Int32?' }],
      },
      {
        name: 'WithHostPort',
        targetTypeId: 'Assembly/Aspire.Hosting.Postgres.PgWebContainerResource',
        parameters: [{ type: 'System.Int32?' }],
      },
    ],
  };

  const items = getTsTopLevelRouteItems(doc);
  expect(getTsStandaloneFunctions(doc)).toHaveLength(2);
  expect(getTsItemSlug(items[0], items)).toBe(
    'withhostport-aspire-hosting-postgres-pgadmincontainerresource-system-int32'
  );
  expect(getTsItemSlug(items[1], items)).toBe(
    'withhostport-aspire-hosting-postgres-pgwebcontainerresource-system-int32'
  );
});

test('getTsMethodSlug disambiguates overloads by signature', () => {
  const methods = [
    {
      name: 'PublishAsDockerFile',
      parameters: [],
    },
    {
      name: 'PublishAsDockerFile',
      parameters: [{ type: 'System.Collections.Generic.IEnumerable<Aspire.Hosting.ApplicationModel.DockerBuildArg>?' }],
    },
  ];

  expect(getTsMethodSlug(methods[0], methods, 'ExecutableResourceBuilderExtensions')).toBe(
    'publishasdockerfile-executableresourcebuilderextensions-noargs'
  );
  expect(getTsMethodSlug(methods[1], methods, 'ExecutableResourceBuilderExtensions')).toBe(
    'publishasdockerfile-executableresourcebuilderextensions-system-collections-generic-ienumerable-aspire-hosting-applicationmodel-dockerbuildarg'
  );
});