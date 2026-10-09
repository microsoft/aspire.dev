interface StaticTranslator {
  (...args: never[]): unknown;
  all(): object | undefined;
}

interface CachedTranslation {
  source: string;
  result: string;
}

const dictionaries = new WeakMap<object, Map<string, CachedTranslation>>();

/** Reuse plain UI labels, not interpolation, fallback, or option-dependent translations. */
export function cacheStaticTranslations<T extends StaticTranslator>(translate: T): T {
  return new Proxy(translate, {
    apply(target, thisArg: unknown, args: unknown[]): unknown {
      const key = args[0];
      if (args.length !== 1 || typeof key !== 'string' || key.includes(':')) {
        return Reflect.apply(target, thisArg, args);
      }

      const dictionary = target.all();
      const source: unknown = dictionary && Object.hasOwn(dictionary, key)
        ? Reflect.get(dictionary, key)
        : undefined;
      if (!dictionary || typeof source !== 'string' || source.includes('{{') || source.includes('$t(')) {
        return Reflect.apply(target, thisArg, args);
      }

      const cache = dictionaries.get(dictionary) ?? new Map<string, CachedTranslation>();
      dictionaries.set(dictionary, cache);
      const cached = cache.get(key);
      if (cached?.source === source) return cached.result;

      const result: unknown = Reflect.apply(target, thisArg, args);
      if (result === source) cache.set(key, { source, result });
      return result;
    },
  });
}
