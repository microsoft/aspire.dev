import { describe, expect, test } from 'vitest';

import { getGoItemSlug, getGoTopLevelRouteItems } from '@utils/go-api-routes';
import type { GoApiDocumentRouteLike } from '@utils/go-api-routes';
import { resolveGoDocRef } from '@utils/go-doc-refs';

const doc: GoApiDocumentRouteLike = {
  functions: [
    {
      name: 'WithNodePool',
      qualifiedName: 'withNodePool',
      kind: 'Method',
      receiver: 'KubernetesEnvironmentResource',
    },
    {
      name: 'WithHostPort',
      qualifiedName: 'withHostPort',
      kind: 'Method',
      receiver: 'RedisResource',
    },
    {
      name: 'WithHostPort',
      qualifiedName: 'withHostPort',
      kind: 'Method',
      receiver: 'RedisInsightResource',
    },
    {
      name: 'WithModule',
      qualifiedName: 'RedisResource.withModule',
      kind: 'InstanceMethod',
      receiver: 'RedisResource',
    },
  ],
  handleTypes: [
    { name: 'Resource', fullName: 'Aspire.Hosting.ApplicationModel.IResource' },
    { name: 'DistributedApplication', fullName: 'Aspire.Hosting.DistributedApplication' },
    { name: 'ResourceBuilder', fullName: 'Aspire.Hosting.ApplicationModel.IResourceBuilder`1' },
  ],
  dtoTypes: [
    {
      name: 'ReferenceExpression',
      fullName: 'Aspire.Hosting.ApplicationModel.ReferenceExpression',
    },
  ],
  enumTypes: [
    { name: 'ContainerLifetime', fullName: 'Aspire.Hosting.ApplicationModel.ContainerLifetime' },
  ],
};

describe('resolveGoDocRef', () => {
  test.each([
    ['IResource', 'Resource', 'resource/'],
    ['DistributedApplication', 'DistributedApplication', 'distributedapplication/'],
    ['ReferenceExpression', 'ReferenceExpression', 'referenceexpression/'],
    ['ContainerLifetime', 'ContainerLifetime', 'containerlifetime/'],
    ['IResourceBuilder`1', 'ResourceBuilder', 'resourcebuilder/'],
  ])('resolves type:%s to the Go page named %s', (target, label, path) => {
    expect(resolveGoDocRef(doc, 'type', target)).toEqual({ label, path });
  });

  test.each([
    ['IHost', 'a type with no Go page'],
    ['Resource', 'the Go name instead of the C# name'],
    ['', 'an empty target'],
  ])('leaves type:%s unresolved for %s', (target) => {
    expect(resolveGoDocRef(doc, 'type', target)).toBeUndefined();
  });

  test('resolves an extension method to its package function', () => {
    expect(resolveGoDocRef(doc, 'method', 'KubernetesEnvironmentExtensions.withNodePool')).toEqual({
      label: 'WithNodePool',
      path: 'withnodepool/',
    });
  });

  test.each([
    ['ResourceCommandAnnotation.ExecuteCommand', 'an instance member of another class'],
    ['RedisBuilderExtensions.withHostPort', 'an overload shared by several receivers'],
    ['RedisBuilderExtensions.withModule', 'an instance method that has no page of its own'],
    ['KubernetesEnvironmentExtensions.missing', 'an unknown function'],
    ['withNodePool', 'a name without an owner'],
  ])('leaves method:%s unresolved for %s', (target) => {
    expect(resolveGoDocRef(doc, 'method', target)).toBeUndefined();
  });

  test('does not resolve fields', () => {
    expect(resolveGoDocRef(doc, 'field', 'ResourceCommandAnnotation.Name')).toBeUndefined();
  });

  test('uses the page slug when a function and a type share a name', () => {
    const colliding: GoApiDocumentRouteLike = {
      functions: [{ name: 'Thing', qualifiedName: 'thing', kind: 'Method', receiver: 'Owner' }],
      handleTypes: [{ name: 'Thing', fullName: 'Aspire.Hosting.IThing' }],
    };
    const [handle] = colliding.handleTypes ?? [];

    const resolved = resolveGoDocRef(colliding, 'type', 'IThing');

    expect(resolved?.path).toBe(`${getGoItemSlug(handle, getGoTopLevelRouteItems(colliding))}/`);
    expect(resolved?.path).not.toBe('thing/');
  });
});
