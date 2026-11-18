import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';

const resolveReal = (url) => normalizePath(realpathSync(fileURLToPath(url)));

/**
 * Redirects every import of Starlight's `<Icon>` component, including Starlight's own internal
 * imports and plugin components, to `src/components/starlight/Icon.astro`, which serves common
 * icons from a shared SVG sprite instead of inlining their paths into every page. The wrapper
 * itself still imports the original component for icons outside the sprite.
 */
export function starlightIconSprite() {
  const wrapper = resolveReal(new URL('../src/components/starlight/Icon.astro', import.meta.url));
  const original = resolveReal(
    new URL('../node_modules/@astrojs/starlight/user-components/Icon.astro', import.meta.url)
  );

  return {
    name: 'aspire:starlight-icon-sprite',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.endsWith('Icon.astro')) return null;
      if (normalizePath(importer.split('?')[0]) === wrapper) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || normalizePath(resolved.id.split('?')[0]) !== original) return null;
      return wrapper;
    },
  };
}
