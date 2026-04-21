import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import ecTwoSlash from 'expressive-code-twoslash';
import { pluginDisableCopy } from './src/expressive-code-plugins/disable-copy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASPIRE_TYPES_PATH = resolve(__dirname, 'src/data/twoslash/aspire.d.ts');

// The bundle is source-controlled (see #741), so a missing file means the
// tree is corrupted — not a normal path. Fail the build rather than silently
// shipping samples that can't resolve `./.modules/aspire.js`.
if (!existsSync(ASPIRE_TYPES_PATH)) {
  throw new Error(
    `[ec] src/data/twoslash/aspire.d.ts not found at ${ASPIRE_TYPES_PATH}. ` +
      'Run `pnpm twoslash-types` to regenerate it from src/data/ts-modules.'
  );
}
const aspireTypes = readFileSync(ASPIRE_TYPES_PATH, 'utf8');

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
          // Omit `lib` so twoslash falls back to `lib.esnext.full.d.ts`
          // (target: ESNext) — that bundle pulls in `Date`, `URL`, DOM,
          // and other common globals via triple-slash references. Pinning
          // an explicit `lib` array breaks those references in the VFS.
        },
        handbookOptions: {
          // Fail the build on unannotated TS errors instead of rendering them
          // as squigglies in shipped HTML. Blocks that deliberately illustrate
          // a compiler error must opt in with `// @errors: <codes>`; otherwise
          // an error means the sample (or the generated SDK shape) is wrong
          // and should be fixed, not rendered to readers.
          noErrorValidation: false,
        },
        // Virtual files merged into the Twoslash VFS. The Aspire SDK types
        // are declared at `.modules/aspire.ts` so docs samples that import
        // `'./.modules/aspire.js'` resolve against the real API surface.
        extraFiles: { '.modules/aspire.ts': aspireTypes },
      },
    }),
  ],
  defaultProps: {
    showLineNumbers: false,
  },
};
