import { expect, test } from 'vitest';

import { buildTsApiSearchIndex } from '../../src/utils/ts-api-search';
import { getTsApiSearchStats } from '../../src/utils/ts-api-search-stats';

test('buildTsApiSearchIndex produces canonical hrefs for standalone functions and handle members', () => {
  const index = buildTsApiSearchIndex([
    {
      package: {
        name: 'Aspire.Hosting.JavaScript',
        version: '13.2.0',
      },
      functions: [
        {
          name: 'withBun',
          capabilityId: 'Aspire.Hosting.JavaScript/withBun',
          qualifiedName: 'withBun',
          signature: 'withBun(install?: boolean, installArgs?: string[]): JavaScriptAppResource',
          description: 'Configures Bun as the package manager',
          expandedTargetTypes: [
            'Aspire.Hosting.JavaScript.JavaScriptAppResource',
            'Aspire.Hosting.JavaScript.NodeAppResource',
            'Aspire.Hosting.JavaScript.ViteAppResource',
          ],
          parameters: [
            { name: 'install', type: 'boolean' },
            { name: 'installArgs', type: 'string[]' },
          ],
        },
      ],
      handleTypes: [
        {
          name: 'JavaScriptAppResource',
          fullName: 'Aspire.Hosting.JavaScript.JavaScriptAppResource',
          capabilities: [
            {
              name: 'command',
              kind: 'PropertyGetter',
              signature: 'command(): string',
              description: 'Gets the Command property',
            },
            {
              name: 'withBun',
              capabilityId: 'Aspire.Hosting.JavaScript/withBun',
              kind: 'Method',
              qualifiedName: 'withBun',
              signature: 'withBun(install?: boolean, installArgs?: string[]): JavaScriptAppResource',
              description: 'Configures Bun as the package manager',
              parameters: [
                { name: 'install', type: 'boolean' },
                { name: 'installArgs', type: 'string[]' },
              ],
            },
          ],
        },
      ],
    },
  ]);

  expect(index).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        n: 'withBun',
        k: 'method',
        h: '/reference/api/typescript/aspire.hosting.javascript/withbun/',
        v: '13.2.0',
      }),
      expect.objectContaining({
        n: 'command',
        k: 'property',
        t: 'JavaScriptAppResource',
        h: '/reference/api/typescript/aspire.hosting.javascript/javascriptappresource/#command',
        m: true,
        v: '13.2.0',
      }),
    ])
  );

  expect(index.filter((entry) => entry.n === 'withBun')).toHaveLength(1);
});

test('getTsApiSearchStats counts capabilities from indexed members and properties', () => {
  const index = buildTsApiSearchIndex([
    {
      package: {
        name: 'Aspire.Hosting.JavaScript',
        version: '13.2.0',
      },
      functions: [
        {
          name: 'withBun',
          capabilityId: 'Aspire.Hosting.JavaScript/withBun',
          qualifiedName: 'withBun',
          signature: 'withBun(install?: boolean, installArgs?: string[]): JavaScriptAppResource',
          description: 'Configures Bun as the package manager',
          expandedTargetTypes: [
            'Aspire.Hosting.JavaScript.JavaScriptAppResource',
          ],
          parameters: [
            { name: 'install', type: 'boolean' },
          ],
        },
      ],
      handleTypes: [
        {
          name: 'JavaScriptAppResource',
          fullName: 'Aspire.Hosting.JavaScript.JavaScriptAppResource',
          capabilities: [
            {
              name: 'command',
              kind: 'PropertyGetter',
              signature: 'command(): string',
              description: 'Gets the Command property',
            },
          ],
        },
      ],
    },
  ]);

  expect(getTsApiSearchStats(index)).toEqual({
    packageCount: 1,
    capabilityCount: 2,
    typeCount: 1,
  });
});