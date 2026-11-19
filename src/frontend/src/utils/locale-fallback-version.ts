import { createHash } from 'node:crypto';

/**
 * Short content hash of the emitted locale dictionaries. Clients request
 * `/locale-fallback/{locale}.json?v={version}`, so the edge can cache each
 * dictionary indefinitely and a content change produces a new URL.
 *
 * @param dictionaries Serialized dictionaries keyed by locale, exactly as emitted.
 */
export function hashLocaleFallbackDictionaries(
  dictionaries: Readonly<Record<string, string>>
): string {
  const hash = createHash('sha256');
  for (const locale of Object.keys(dictionaries).sort()) {
    hash.update(`${locale}\n${dictionaries[locale]}\n`);
  }
  return hash.digest('hex').slice(0, 12);
}
