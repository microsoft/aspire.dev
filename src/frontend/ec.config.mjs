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
const { pluginIcon } = await tsImport(
  new URL('./node_modules/starlight-plugin-icons/src/lib/expressive-code.ts', import.meta.url).href,
  import.meta.url
);

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
