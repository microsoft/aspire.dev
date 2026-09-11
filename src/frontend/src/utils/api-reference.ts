import {
  buildApiReferenceIndex,
  type ApiReferenceIndex,
  type ApiReferenceResolution,
} from './api-reference-core';
import { getPackages } from './packages';
import { getTsModules } from './ts-modules';

let productionIndexPromise: Promise<ApiReferenceIndex> | undefined;
const requestIndexPromises = new WeakMap<object, Promise<ApiReferenceIndex>>();

async function createApiReferenceIndex(): Promise<ApiReferenceIndex> {
  const [packages, modules] = await Promise.all([getPackages(), getTsModules()]);
  return buildApiReferenceIndex(
    packages.map((entry) => entry.data),
    modules.map((entry) => entry.data)
  );
}

/**
 * Reuse one index for an entire production build. In development, cache per
 * page request so repeated references are O(1) while content edits appear on
 * the next request without restarting the dev server.
 */
export function getApiReferenceIndex(requestScope?: object): Promise<ApiReferenceIndex> {
  if (import.meta.env.PROD || !requestScope) {
    productionIndexPromise ??= createApiReferenceIndex();
    return productionIndexPromise;
  }

  let indexPromise = requestIndexPromises.get(requestScope);
  if (!indexPromise) {
    indexPromise = createApiReferenceIndex();
    requestIndexPromises.set(requestScope, indexPromise);
  }
  return indexPromise;
}

export async function resolveApiReference(
  name: string,
  packageName?: string,
  requestScope?: object
): Promise<ApiReferenceResolution> {
  const index = await getApiReferenceIndex(requestScope);
  return index.resolve(name, packageName);
}

export type {
  ApiReferenceDiagnostic,
  ApiReferenceDiagnosticCode,
  ApiReferenceIndex,
  ApiReferenceResolution,
  ApiReferenceTarget,
} from './api-reference-core';
