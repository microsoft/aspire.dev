import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Assets `og-image-renderer` reads from disk. They are not part of Astro's module
// graph, so their content has to be part of the incremental-build cache key.
const RENDERER_ASSETS = [
  path.join('src', 'assets', 'fonts', 'Outfit-Regular.ttf'),
  path.join('src', 'assets', 'fonts', 'Outfit-Bold.ttf'),
  path.join('public', 'og-image.png'),
];

let assetFingerprint: string | undefined;

function getAssetFingerprint(): string {
  if (!assetFingerprint) {
    const hash = createHash('sha1');
    for (const asset of RENDERER_ASSETS) {
      hash.update(readFileSync(path.resolve(asset)));
    }
    assetFingerprint = hash.digest('base64url');
  }
  return assetFingerprint;
}

/** Incremental-build cache key for a rendered social card: its inputs plus the renderer's assets. */
export function ogCardCacheKey(inputs: Record<string, string | undefined>): string {
  return createHash('sha1')
    .update(getAssetFingerprint())
    .update(JSON.stringify(inputs))
    .digest('base64url');
}
