import type { TsFunction } from './ts-modules';

type TsFunctionLike = Pick<TsFunction, 'capabilityId' | 'expandedTargetTypes' | 'name' | 'qualifiedName' | 'signature'>;

export function isTsExtensionStyleFunction(fn: Pick<TsFunctionLike, 'expandedTargetTypes'>): boolean {
  return (fn.expandedTargetTypes?.length ?? 0) > 0;
}

export function getTsFunctionDisplayKind(fn: Pick<TsFunctionLike, 'expandedTargetTypes'>): 'function' | 'method' {
  return isTsExtensionStyleFunction(fn) ? 'method' : 'function';
}

export function getTsFunctionDisplayLabel(fn: Pick<TsFunctionLike, 'expandedTargetTypes'>): 'Function' | 'Method' {
  return isTsExtensionStyleFunction(fn) ? 'Method' : 'Function';
}

export function getTsCallableIdentityKey(callable: TsFunctionLike): string {
  return callable.capabilityId ?? `${callable.qualifiedName ?? callable.name}::${callable.signature ?? ''}`;
}