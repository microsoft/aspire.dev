import { createHash } from 'node:crypto';
const keys = new WeakMap<object, string>();

export function apiCacheKey(data: object): string | undefined {
  if (!import.meta.env.PROD || process.env.ASPIRE_INCREMENTAL_BUILD !== '1') return undefined;
  const icons = import.meta.env.ASPIRE_INCREMENTAL_ICON_DIGEST;
  if (typeof icons !== 'string' || !/^[a-f\d]{64}$/.test(icons)) {
    throw new Error('Incremental icon metadata was not captured after Starlight setup.');
  }
  let key = keys.get(data);
  if (!key) {
    // Whole-package data includes siblings used by sidebars and type links.
    key = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    keys.set(data, key);
  }
  return createHash('sha256').update(icons).update(key).digest('hex');
}
