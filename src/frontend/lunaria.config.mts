import { defineConfig } from '@lunariajs/core/config';
import renderer from './lunaria/renderer.config.ts';

export default defineConfig({
  repository: {
    name: 'microsoft/aspire.dev',
    branch: 'main',
    rootDir: 'src/frontend',
    hosting: 'github',
  },
  sourceLocale: {
    label: 'English',
    lang: 'en',
  },
  locales: [
    {
      label: 'Deutsch',
      lang: 'de',
    },
    {
      label: 'Español',
      lang: 'es',
    },
    {
      label: '日本語',
      lang: 'ja',
    },
    {
      label: 'Français',
      lang: 'fr',
    },
    {
      label: 'Italiano',
      lang: 'it',
    },
    {
      label: 'Bahasa Indonesia',
      lang: 'id',
    },
    {
      label: '简体中文',
      lang: 'zh-cn',
    },
    {
      label: 'Português do Brasil',
      lang: 'pt-br',
    },

    {
      label: '한국어',
      lang: 'ko',
    },
    {
      label: 'Türkçe',
      lang: 'tr',
    },
    {
      label: 'Русский',
      lang: 'ru',
    },
    {
      label: 'हिंदी',
      lang: 'hi',
    },
    {
      label: 'Dansk',
      lang: 'da',
    },
    {
      label: 'Українська',
      lang: 'uk',
    },
  ],
  files: [
    {
      include: ['src/content/docs/**/*.{md,mdx}'],
      pattern: {
        source: 'src/content/docs/@path',
        locales: 'src/content/docs/@lang/@path',
      },
      type: 'universal',
      exclude: ['src/content/docs/reference/api/**/*.*'],
    },
  ],
  dashboard: {
    title: 'Aspire Docs Translation Status',
    description:
      'Translation progress tracker for the Aspire Docs site. See how much has been translated in your language and get involved!',
    site: 'https://aspire.dev/i18n/',
    favicon: {
      external: [
        {
          link: 'https://aspire.dev/favicon.svg',
          type: 'image/svg+xml',
        },
        {
          link: 'https://aspire.dev/favicon.ico',
          type: 'image/x-icon',
        },
      ],
    },
    customCss: ['./lunaria/styles.css'],
    basesToHide: ['src/content/docs/', 'src/i18n/'],
    ui: {
      'statusByLocale.heading': 'Translation progress by locale',
      'statusByLocale.incompleteLocalizationLink': 'incomplete translation',
      'statusByLocale.outdatedLocalizationLink': 'outdated translation',
      'statusByLocale.completeLocalization': 'This translation is complete, amazing job! 🎉',
      'statusByFile.heading': 'Translation status by file',
    },
  },
  tracking: {
    ignoredKeywords: [
      'lunaria-ignore',
      'typo',
      'en-only',
      'broken link',
      'i18nReady',
      'i18nIgnore',
    ],
  },
  renderer,
});
