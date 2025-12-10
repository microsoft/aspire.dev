// @ts-check
import { defineConfig } from 'astro/config';
import { sidebarTopics } from './config/sidebar/sidebar.topics.ts';
import { redirects } from './config/redirects.mjs';
import { iconPacks } from './config/icon-packs.mjs';
import { cookieConfig } from './config/cookie.config';
import { locales } from './config/locales.ts';
import { headAttrs } from './config/head.attrs.ts';
import { socialConfig } from './config/socials.config.ts';
import catppuccin from '@catppuccin/starlight';
import lunaria from '@lunariajs/starlight';
import mermaid from 'astro-mermaid';
import starlight from '@astrojs/starlight';
import starlightGitHubAlerts from 'starlight-github-alerts';
import starlightImageZoom from 'starlight-image-zoom';
import starlightKbd from 'starlight-kbd';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightScrollToTop from 'starlight-scroll-to-top';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import jopSoftwarecookieconsent from '@jop-software/astro-cookieconsent';

// https://astro.build/config
export default defineConfig({
  prefetch: true,
  site: 'https://aspire.dev',
  trailingSlash: 'always',
  redirects: redirects,
  integrations: [
    mermaid({
      theme: 'forest',
      autoTheme: true,
      iconPacks,
    }),
    starlight({
      title: 'Aspire',
      defaultLocale: 'root',
      locales,
      logo: {
        src: './src/assets/aspire-logo-32.svg',
        replacesTitle: true,
      },
      editLink: {
        baseUrl: 'https://github.com/microsoft/aspire.dev/edit/main/src/frontend/',
      },
      favicon: 'favicon.svg',
      head: headAttrs,
      social: socialConfig,
      customCss: ['@fontsource-variable/outfit', './src/styles/site.css'],
      components: {
        EditLink: './src/components/starlight/EditLink.astro',
        Footer: './src/components/starlight/Footer.astro',
        Head: './src/components/starlight/Head.astro',
        Header: './src/components/starlight/Header.astro',
        Hero: './src/components/starlight/Hero.astro',
        MarkdownContent: './src/components/starlight/MarkdownContent.astro',
        Search: './src/components/starlight/Search.astro',
        Sidebar: './src/components/starlight/Sidebar.astro',
        SocialIcons: './src/components/starlight/SocialIcons.astro',
      },
      expressiveCode: {
        // https://expressive-code.com/guides/themes/#using-bundled-themes
        themes: ['laserwave', 'slack-ochin'],
        styleOverrides: { borderRadius: '0.5rem', codeFontSize: '1rem' },
      },
      plugins: [
        lunaria({
          route: '/i18n',
          sync: false,
        }),
        catppuccin(),
        starlightSidebarTopics(sidebarTopics, {
          exclude: ['**/includes/**/*'],
        }),
        ...(process.env.CHECK_LINKS
          ? [
              starlightLinksValidator({
                errorOnRelativeLinks: false,
                errorOnFallbackPages: false,
              }),
            ]
          : []),
        starlightScrollToTop({
          // https://frostybee.github.io/starlight-scroll-to-top/svg-paths/
          svgPath: 'M4 16L12 8L20 16',
          showTooltip: true,
          threshold: 10,
          showOnHomepage: true,
          tooltipText: {
            da: 'Rul op',
            de: 'Nach oben scrollen',
            en: 'Scroll to top',
            es: 'Ir arriba',
            fr: 'Retour en haut',
            hi: 'ऊपर स्क्रॉल करें',
            id: 'Gulir ke atas',
            it: 'Torna su',
            ja: 'トップへ戻る',
            ko: '맨 위로',
            'pt-br': 'Voltar ao topo',
            'pt-pt': 'Voltar ao início',
            ru: 'Наверх',
            tr: 'Başa dön',
            uk: 'Прокрутити вгору',
            'zh-cn': '回到顶部',
          },
        }),
        starlightGitHubAlerts(),
        starlightLlmsTxt({
          projectName: 'Aspire',
          description:
            'Aspire is a polyglot local dev-time orchestration tool chain for building, running, debugging, and deploying distributed applications.',
          exclude: ['reference/api/**', '/reference/api/**', '**/api/**'],
        }),
        starlightImageZoom({
          showCaptions: true,
        }),
        starlightKbd({
          types: [
            { id: 'mac', label: 'macOS', detector: 'apple' },
            { id: 'windows', label: 'Windows', detector: 'windows', default: true },
            { id: 'linux', label: 'Linux', detector: 'linux' },
          ],
        }),
      ],
    }),
    jopSoftwarecookieconsent(cookieConfig),
  ],
});
