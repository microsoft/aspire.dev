import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import ecTwoSlash from 'expressive-code-twoslash';
import { tsImport } from 'tsx/esm/api';
import { pluginDisableCopy } from './src/expressive-code-plugins/disable-copy.mjs';
import {
  TWOSLASH_ENABLED,
  TWOSLASH_LANGUAGES,
  ASPIRE_TYPES_PATH,
  getTwoslashOptions,
  readAspireTypes,
} from './config/twoslash.config.mjs';

// starlight-plugin-icons publishes this EC plugin as TypeScript source.
// Load the package implementation directly so we do not duplicate its icon logic.
//
// Resolve the path from the project root (cwd) rather than `import.meta.url`.
// During the build's prerender phase, Astro bundles this config into
// `dist/.prerender/chunks/`, which moves `import.meta.url` away from the project
// root. A chunk-relative `./node_modules/...` URL then points at a non-existent
// path, the import throws, and the `<Code>` component renderer silently falls
// back to a default Expressive Code config. That mismatched config produces a
// different asset hash than the markdown renderer, so pages reference EC
// stylesheet/script files that are never emitted (404s). A cwd-anchored absolute
// path stays valid in both the integration and bundled prerender contexts.
const pluginIconSource = pathToFileURL(
  path.resolve(process.cwd(), 'node_modules/starlight-plugin-icons/src/lib/expressive-code.ts')
).href;
const { pluginIcon } = await tsImport(pluginIconSource, import.meta.url);

if (TWOSLASH_ENABLED && !readAspireTypes().exists) {
  // Non-fatal — twoslash blocks that import the SDK will just show `any`.
  // Run `pnpm twoslash-types` to refresh.
  console.warn(`[ec] ${ASPIRE_TYPES_PATH} missing — run \`pnpm twoslash-types\``);
}

/** @type {import('@astrojs/starlight/expressive-code').StarlightExpressiveCodeOptions} */
export default {
  // https://expressive-code.com/guides/themes/#using-bundled-themes
  // preview themes here: https://textmate-grammars-themes.netlify.app/
  themes: ['laserwave', 'slack-ochin'],
  styleOverrides: { borderRadius: '0.5rem', codeFontSize: '1rem' },
  plugins: [
    pluginCollapsibleSections(),
    pluginLineNumbers(),
    pluginIcon(),
    pluginDisableCopy(),
    ...(TWOSLASH_ENABLED
      ? [
          ecTwoSlash({
            // Only run on TS blocks that opt in via the `twoslash` meta flag.
            instanceConfigs: {
              // Docs samples use both `ts` and `typescript` fence languages; accept both.
              twoslash: {
                explicitTrigger: true,
                languages: TWOSLASH_LANGUAGES,
              },
            },
            includeJsDoc: true,
            twoslashOptions: getTwoslashOptions(),
          }),
        ]
      : []),
  ],
  defaultProps: {
    showLineNumbers: false,
  },
};
