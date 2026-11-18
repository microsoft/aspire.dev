import type { GoFunction } from './go-modules';

type GoFunctionLike = Pick<GoFunction, 'capabilityId' | 'name' | 'qualifiedName' | 'receiver' | 'signature'>;

/** Go methods carry a receiver type; package-level functions such as CreateBuilder have none. */
export function isGoMethodStyleFunction(fn: Pick<GoFunctionLike, 'receiver'>): boolean {
  return typeof fn.receiver === 'string' && fn.receiver.length > 0;
}

export function getGoFunctionDisplayKind(fn: Pick<GoFunctionLike, 'receiver'>): 'function' | 'method' {
  return isGoMethodStyleFunction(fn) ? 'method' : 'function';
}

export function getGoFunctionDisplayLabel(fn: Pick<GoFunctionLike, 'receiver'>): 'Function' | 'Method' {
  return isGoMethodStyleFunction(fn) ? 'Method' : 'Function';
}

/** The receiver is part of the identity: one capability can be specialised for several receiver types. */
export function getGoCallableIdentityKey(callable: GoFunctionLike): string {
  const identity = callable.capabilityId ?? `${callable.qualifiedName ?? callable.name}::${callable.signature ?? ''}`;
  return `${identity}::${callable.receiver ?? ''}`;
}
