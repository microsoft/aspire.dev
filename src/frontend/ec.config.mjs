import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import ecTwoSlash from 'expressive-code-twoslash';
import { pluginDisableCopy } from './src/expressive-code-plugins/disable-copy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASPIRE_TYPES_PATH = resolve(__dirname, '.twoslash-types/aspire.d.ts');
const aspireTypes = existsSync(ASPIRE_TYPES_PATH)
  ? readFileSync(ASPIRE_TYPES_PATH, 'utf8')
  : '';

if (!aspireTypes) {
  // Non-fatal — twoslash blocks that import the SDK will just show `any`.
  // Run `pnpm tsx scripts/generate-twoslash-types.ts` to refresh.
  console.warn('[ec] .twoslash-types/aspire.d.ts missing — run scripts/generate-twoslash-types.ts');
}

/** @type {import('@astrojs/starlight/expressive-code').StarlightExpressiveCodeOptions} */
export default {
  plugins: [
    pluginCollapsibleSections(),
    pluginLineNumbers(),
    pluginDisableCopy(),
    ecTwoSlash({
      // Only run on TS blocks that opt in via the `twoslash` meta flag.
      instanceConfigs: {
        // Docs samples use both `ts` and `typescript` fence languages; accept both.
        twoslash: { explicitTrigger: true, languages: ['ts', 'tsx', 'typescript'] },
      },
      includeJsDoc: true,
      twoslashOptions: {
        compilerOptions: {
          // ts.ModuleResolutionKind.Bundler so `./.modules/aspire.js` falls
          // through to the virtual `.modules/aspire.ts` file declared below.
          moduleResolution: 100,
          // ts.ModuleKind.ESNext (paired with bundler resolution).
          module: 99,
          // ts.ScriptTarget.ESNext.
          target: 99,
          strict: true,
          noEmit: true,
          lib: ['lib.es2022.d.ts'],
        },
        handbookOptions: {
          // Keep type squigglies rendered inline but don't fail the build when
          // a sample has unannotated compiler errors — the generated SDK is a
          // best-effort shape and docs samples shouldn't need `// @errors` tags.
          noErrorValidation: true,
        },
        // Virtual files merged into the Twoslash VFS. The Aspire SDK types
        // are declared at `.modules/aspire.ts` so docs samples that import
        // `'./.modules/aspire.js'` resolve against the real API surface.
        extraFiles: {
          'console.d.ts':
            'declare var console: { log(...args: unknown[]): void; error(...args: unknown[]): void; warn(...args: unknown[]): void; info(...args: unknown[]): void; debug(...args: unknown[]): void; };\n',
          ...(aspireTypes ? { '.modules/aspire.ts': aspireTypes } : {}),
        },
      },
    }),
  ],
  defaultProps: {
    showLineNumbers: false,
  },
};
