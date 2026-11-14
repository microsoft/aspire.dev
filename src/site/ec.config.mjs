// Expressive Code configuration of the site, read by scripts/code-worker.mjs (the `code` and `code-assets` steps of
// douze.yml). It is src/frontend/ec.config.mjs and src/frontend/config/twoslash.config.mjs, plus what Starlight's
// Expressive Code integration added on top of them (@astrojs/starlight/integrations/expressive-code): the
// `[data-theme=...]` selectors of the dark mode switch, the `starlight.components` cascade layer, Starlight's style
// defaults under the site's overrides, the `not-content` class on every frame and the translated frame texts.
//
// The default export is the engine's configuration (`new ExpressiveCode(config)`), with `themes` as bundled Shiki theme
// names that the worker loads. `cacheInputs` lists the files whose content changes the rendered HTML besides this one:
// the worker folds them into the key of its per-fence cache.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { pluginFramesTexts } from 'expressive-code';
import { addClassName, h } from 'expressive-code/hast';
import ecTwoSlash from 'expressive-code-twoslash';

const siteRoot = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------------------------------------------
// Twoslash (src/frontend/config/twoslash.config.mjs)
// ---------------------------------------------------------------------------------------------------------------

/** The generated Aspire SDK declaration bundle (`pnpm twoslash-types` in src/frontend writes the original). */
export const ASPIRE_TYPES_PATH = join(siteRoot, 'data', 'twoslash', 'aspire.d.ts');

/** The tsconfig the twoslash plugin requires; it only locates TypeScript's lib folder with it. */
const TWOSLASH_TSCONFIG_PATH = join(siteRoot, 'data', 'twoslash', 'tsconfig.json');

/** Languages whose fences participate in twoslash (with `twoslash` in their meta). */
export const TWOSLASH_LANGUAGES = ['ts', 'tsx', 'typescript'];

/** Master switch: false disables twoslash without removing the wiring. */
export const TWOSLASH_ENABLED = true;

/**
 * True when Douze's `twoslash` step computes the results (TWOSLASH=douze, set by the `code` step of douze.yml): the
 * plugin renders them (scripts/twoslash-results.mjs), and TypeScript compiles nothing in Node.
 */
export const TWOSLASH_NATIVE = process.env.TWOSLASH === 'douze';

// Numeric values of the TypeScript enums: ModuleResolutionKind.Bundler, ModuleKind.ESNext, ScriptTarget.ESNext.
const TWOSLASH_COMPILER_OPTIONS = Object.freeze({ moduleResolution: 100, module: 99, target: 99, strict: true, noEmit: true });

// An unannotated TS error in a sample does not fail the render (the frontend's audit test reports them).
const TWOSLASH_HANDBOOK_OPTIONS = Object.freeze({ noErrorValidation: true });

/** @type {WeakMap<Map<string, string>, Map<string, string>>} */
const initialFiles = new WeakMap();

/** True when a fence is rendered by twoslash: one of its languages and `twoslash` in the meta. */
export function isTwoslashFence(language, meta) {
  return TWOSLASH_ENABLED && TWOSLASH_LANGUAGES.includes(language) && /\btwoslash\b/.test(meta ?? '');
}

// The SDK lives in the persistent virtual file system, not in extraFiles: twoslash clears extraFiles after every
// snippet, which would make TypeScript parse the 6.5 MB bundle again for each one.
function getTwoslashOptions() {
  const libDirectory = dirname(require.resolve('typescript'));
  /** @type {Map<string, string>} */
  const fsMap = new Map(
    readdirSync(libDirectory)
      .filter((name) => name.endsWith('.d.ts'))
      .map((name) => [`/${name}`, readFileSync(join(libDirectory, name), 'utf8')])
  );
  if (existsSync(ASPIRE_TYPES_PATH)) {
    fsMap.set('/.aspire/modules/aspire.mts', readFileSync(ASPIRE_TYPES_PATH, 'utf8'));
  }
  initialFiles.set(fsMap, new Map(fsMap));
  return {
    compilerOptions: { ...TWOSLASH_COMPILER_OPTIONS },
    handbookOptions: { ...TWOSLASH_HANDBOOK_OPTIONS },
    fsMap,
    cache: new Map(),
  };
}

// A failed snippet can bypass twoslash's cleanup of its virtual files: drop the poisoned environment, and restore
// the SDK and lib files when a sample overrides one with an @filename directive.
function finishTwoslashRun(options, failed) {
  const original = initialFiles.get(options.fsMap);
  if (!original) return;
  let changed = failed;
  for (const [name, source] of original) {
    if (options.fsMap.get(name) !== source) {
      options.fsMap.set(name, source);
      changed = true;
    }
  }
  if (!changed) return;
  options.cache.clear();
  for (const name of options.fsMap.keys()) {
    if (!original.has(name)) options.fsMap.delete(name);
  }
}

// The twoslash plugin with its compilations serialized: one TypeScript program at a time, as the site does today,
// while the other fences (and the other hooks of twoslash fences) render concurrently.
function serializedTwoslashPlugin() {
  if (TWOSLASH_NATIVE) return nativeTwoslashPlugin();
  const options = getTwoslashOptions();
  const plugin = ecTwoSlash({
    instanceConfigs: { twoslash: { explicitTrigger: true, languages: TWOSLASH_LANGUAGES } },
    includeJsDoc: true,
    tsConfigPath: TWOSLASH_TSCONFIG_PATH,
    twoslashOptions: options,
  });
  let pending = Promise.resolve();
  return {
    ...plugin,
    // The site's client script handles the hovers (navigation-safe lifecycle), not the plugin's module.
    jsModules: [],
    hooks: {
      ...plugin.hooks,
      async preprocessCode(context) {
        if (!isTwoslashFence(context.codeBlock.language, context.codeBlock.meta)) {
          return plugin.hooks.preprocessCode(context);
        }
        const current = pending.then(async () => {
          let failed = true;
          try {
            await plugin.hooks.preprocessCode(context);
            failed = false;
          } finally {
            finishTwoslashRun(options, failed);
          }
        });
        pending = current.then(
          () => {},
          () => {}
        );
        return current;
      },
    },
  };
}

/** Languages of the opt-in C# and Go hovers (Douze's `csharp` and `go` steps), rendered by the same plugin. */
const HOVER_LANGUAGES = ['csharp', 'cs', 'go', 'golang'];

// The twoslash plugin rendering the results of Douze's steps: no compilation, so no serialization and no file system.
// It also renders the C# and Go fences that the `csharp` and `go` steps gave results (their popups are highlighted as
// TypeScript: the plugin renders every popup's signature as `ts`).
function nativeTwoslashPlugin() {
  const plugin = ecTwoSlash({
    instanceConfigs: { twoslash: { explicitTrigger: true, languages: [...TWOSLASH_LANGUAGES, ...HOVER_LANGUAGES] } },
    includeJsDoc: true,
    tsConfigPath: TWOSLASH_TSCONFIG_PATH,
    twoslashOptions: { compilerOptions: { ...TWOSLASH_COMPILER_OPTIONS }, handbookOptions: { ...TWOSLASH_HANDBOOK_OPTIONS } },
  });
  return { ...plugin, jsModules: [] };
}

// ---------------------------------------------------------------------------------------------------------------
// Frame icons (starlight-plugin-icons' pluginIcon)
// ---------------------------------------------------------------------------------------------------------------
//
// The same logic as starlight-plugin-icons/src/lib/expressive-code.ts and material-icons.ts (1.1.6), which cannot be
// loaded as a package here: it is TypeScript source (tsx), its peers pull Astro, Starlight and UnoCSS, and it fetches
// the icon data from GitHub at every start (a per-fence cache would then keep stale icons). This port reads the
// vendored data only: `<site>/.starlight-icons/` (where uno.config.ts expects the cache to move), else
// `src/frontend/.starlight-icons/` until the cutover. Without data, frames have no icons, as in the original.

const ICONS_DIRS = [join(siteRoot, '.starlight-icons'), resolve(siteRoot, '../frontend/.starlight-icons')];
const ICONS_DIR = ICONS_DIRS.find((dir) => existsSync(join(dir, 'material-icons.json')));

function loadIconData() {
  if (!ICONS_DIR) return undefined;
  return {
    languageMap: JSON.parse(readFileSync(join(ICONS_DIR, 'language-map.json'), 'utf8')),
    materialIcons: JSON.parse(readFileSync(join(ICONS_DIR, 'material-icons.json'), 'utf8')),
  };
}

function resolveIcon(data, fileName, language) {
  if (!data || (!fileName && !language)) return null;
  const { languageMap, materialIcons } = data;
  const iconClass = (iconName) => `i-material-icon-theme:${iconName.replace(/_/g, '-')}`;

  if (fileName?.endsWith('.svelte.js')) return 'i-starlight-plugin-icons:svelte-js';
  if (fileName?.endsWith('.svelte.ts')) return 'i-starlight-plugin-icons:svelte-ts';

  if (fileName) {
    const lowerFileName = (fileName.includes('/') ? fileName.split('/').pop() : fileName).toLowerCase();
    const longExtension = lowerFileName.split('.').slice(1).join('.');
    const shortExtension = lowerFileName.split('.').pop() || '';
    const pairs = [
      [lowerFileName, materialIcons.fileNames],
      [longExtension, materialIcons.fileExtensions],
      [shortExtension, materialIcons.fileExtensions],
      [shortExtension, languageMap.fileExtensions],
    ];
    for (const [key, lookup] of pairs) {
      const iconName = lookup?.[key];
      if (iconName && materialIcons.iconDefinitions[iconName]) return iconClass(iconName);
    }
    if (!lowerFileName.startsWith('.')) {
      const iconName = materialIcons.fileNames[`.${lowerFileName}`];
      if (iconName && materialIcons.iconDefinitions[iconName]) return iconClass(iconName);
    }
  }

  const iconName = language && materialIcons.languageIds[language];
  if (iconName && materialIcons.iconDefinitions[iconName]) return iconClass(iconName);

  return 'i-material-icon-theme:document';
}

function pluginIcon() {
  const data = loadIconData();
  return {
    name: 'Plugin Icon',
    hooks: {
      postprocessRenderedBlock({ codeBlock, renderData }) {
        if (!codeBlock.props.title || codeBlock.language === 'sh') return;
        const icon = resolveIcon(data, codeBlock.props.title, codeBlock.language);
        if (!icon) return;
        const figcaption = renderData.blockAst?.children?.find(
          (child) => child.type === 'element' && child.tagName === 'figcaption'
        );
        if (!figcaption?.children) return;
        const titleSpan = figcaption.children.find(
          (child) => child.type === 'element' && child.tagName === 'span' && child.properties?.className?.includes('title')
        );
        const node = h('span', {
          className: [icon, 'code-block-icon'],
          'data-icon': icon,
          'data-language': codeBlock.language,
        });
        (titleSpan ? (titleSpan.children ??= []) : figcaption.children).unshift(node);
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// disable-copy (src/frontend/src/expressive-code-plugins/disable-copy.mjs)
// ---------------------------------------------------------------------------------------------------------------

/** `disable-copy` in the meta adds `data-disable-copy` to the frame, which the site's script reads. */
function pluginDisableCopy() {
  return {
    name: 'disable-copy',
    hooks: {
      preprocessMetadata: ({ codeBlock }) => {
        if (codeBlock.meta && codeBlock.meta.includes('disable-copy')) {
          codeBlock.props.disableCopy = true;
        }
      },
      postprocessRenderedBlock: ({ codeBlock, renderData }) => {
        if (codeBlock.props.disableCopy) {
          renderData.blockAst.properties ??= {};
          renderData.blockAst.properties['data-disable-copy'] = '';
        }
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// What Starlight's integration added
// ---------------------------------------------------------------------------------------------------------------

/** Starlight's `not-content` class on every frame, which keeps the Markdown content styles off code blocks. */
function pluginNotContent() {
  return {
    name: 'Starlight Plugin',
    hooks: {
      postprocessRenderedBlock: ({ renderData }) => addClassName(renderData.blockAst, 'not-content'),
    },
  };
}

// The copy button and terminal frame texts of each locale, from the site's UI strings (data/i18n/<locale>.json,
// `expressiveCode.*`). The worker passes the page's `lang` as the block's locale.
const I18N_DIR = join(siteRoot, 'data', 'i18n');
export const I18N_FILES = existsSync(I18N_DIR)
  ? readdirSync(I18N_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(I18N_DIR, name))
  : [];

for (const file of I18N_FILES) {
  const texts = JSON.parse(readFileSync(file, 'utf8')).expressiveCode;
  if (!texts) continue;
  // Folder keys are lower case (`zh-cn`); language tags are `zh-CN`, as Starlight's `lang`.
  const lang = file
    .slice(I18N_DIR.length + 1, -'.json'.length)
    .replace(/-([a-z]+)$/, (_, region) => `-${region.toUpperCase()}`);
  const overrides = Object.fromEntries(Object.entries(texts).filter(([, value]) => typeof value === 'string' && value));
  if (Object.keys(overrides).length) pluginFramesTexts.overrideTexts(lang, overrides);
}

/** Files besides this one whose content changes the rendered HTML (the worker's per-fence cache key). */
export const cacheInputs = [
  ASPIRE_TYPES_PATH,
  TWOSLASH_TSCONFIG_PATH,
  ...(ICONS_DIR ? [join(ICONS_DIR, 'language-map.json'), join(ICONS_DIR, 'material-icons.json')] : []),
  ...I18N_FILES,
];

/** Spaces per tab in the code, as remark's Expressive Code integration does (`tabWidth`). */
export const tabWidth = 2;

/** @type {import('expressive-code').ExpressiveCodeConfig & { themes: string[] }} */
export default {
  // https://expressive-code.com/guides/themes/#using-bundled-themes
  themes: ['laserwave', 'slack-ochin'],
  // Starlight's dark mode switch: the first theme and the first one of the other type follow `data-theme`.
  themeCssSelector: (theme, { styleVariants }) => {
    if (styleVariants.length >= 2) {
      const baseTheme = styleVariants[0]?.theme;
      const altTheme = styleVariants.find((v) => v.theme.type !== baseTheme?.type)?.theme;
      if (theme === baseTheme || theme === altTheme) return `[data-theme='${theme.type}']`;
    }
    return `[data-theme='${theme.name}']`;
  },
  cascadeLayer: 'starlight.components',
  defaultLocale: 'en',
  // Starlight's defaults, then the site's (borderRadius, codeFontSize).
  styleOverrides: {
    borderRadius: '0.5rem',
    borderWidth: '1px',
    codePaddingBlock: '0.75rem',
    codePaddingInline: '1rem',
    codeFontFamily: 'var(--__sl-font-mono)',
    codeFontSize: '1rem',
    codeLineHeight: 'var(--sl-line-height)',
    uiFontFamily: 'var(--__sl-font)',
    textMarkers: {
      lineDiffIndicatorMarginLeft: '0.25rem',
      defaultChroma: '45',
      backgroundOpacity: '60%',
    },
  },
  plugins: [
    pluginCollapsibleSections(),
    pluginLineNumbers(),
    pluginIcon(),
    pluginDisableCopy(),
    ...(TWOSLASH_ENABLED ? [serializedTwoslashPlugin()] : []),
    pluginNotContent(),
  ],
  defaultProps: {
    showLineNumbers: false,
  },
};
