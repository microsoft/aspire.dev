// @ts-check
import { defineConfig } from 'astro/config';
import { sidebarTopics } from './sidebar.topics';
import { redirects } from './redirects.mjs';
import { iconPacks } from './icon-packs.mjs';
import catppuccin from "@catppuccin/starlight";
import lunaria from '@lunariajs/starlight';
import mermaid from 'astro-mermaid';
import starlight from '@astrojs/starlight';
import starlightGiscus from 'starlight-giscus';
import starlightGitHubAlerts from 'starlight-github-alerts';
import starlightImageZoom from 'starlight-image-zoom';
import starlightKbd from 'starlight-kbd';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightScrollToTop from 'starlight-scroll-to-top';
import starlightSidebarTopics from 'starlight-sidebar-topics';

// Localization: https://lunaria.dev/
export const locales = {
	root: { label: 'English', lang: 'en' },
	de: { label: 'Deutsch', lang: 'de' },
	es: { label: 'Español', lang: 'es' },
	ja: { label: '日本語', lang: 'ja' },
	fr: { label: 'Français', lang: 'fr' },
	it: { label: 'Italiano', lang: 'it' },
	id: { label: 'Bahasa Indonesia', lang: 'id' },
	'zh-cn': { label: '简体中文', lang: 'zh-CN' },
	'pt-br': { label: 'Português do Brasil', lang: 'pt-BR' },
	'pt-pt': { label: 'Português', lang: 'pt-PT' },
	ko: { label: '한국어', lang: 'ko' },
	tr: { label: 'Türkçe', lang: 'tr' },
	ru: { label: 'Русский', lang: 'ru' },
	hi: { label: 'हिंदी', lang: 'hi' },
	da: { label: 'Dansk', lang: 'da' },
	uk: { label: 'Українська', lang: 'uk' },
};

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
			iconPacks
		}),
		starlight({
			title: 'Aspire',
			defaultLocale: 'root',
			locales,
			logo: {
				src: './src/assets/aspire-logo-32.svg',
				replacesTitle: true
			},
			editLink: {
				baseUrl: 'https://github.com/microsoft/aspire.dev/edit/main/src/frontend/',
			},
			favicon: 'favicon.svg',
			head: [
				// SEO meta tags for discoverability (including legacy ".NET Aspire" branding)
				{ tag: 'meta', attrs: { name: 'description', content: 'Aspire is a polyglot local dev-time orchestration tool chain for building, running, debugging, and deploying distributed applications.' } },
				{ tag: 'meta', attrs: { name: 'keywords', content: 'Aspire, .NET Aspire, dotnet aspire, distributed applications, cloud-native, microservices, orchestration, .NET, observability, service discovery, integrations' } },
				{ tag: 'meta', attrs: { name: 'alternate-name', content: '.NET Aspire' } },
				
				// Open Graph meta tags
				{ tag: 'meta', attrs: { property: 'og:title', content: 'Aspire—Your Stack, Streamlined' } },
				{ tag: 'meta', attrs: { property: 'og:description', content: 'Aspire streamlines your development workflow with code-first control, modularity, and observability for distributed applications.' } },
				{ tag: 'meta', attrs: { property: 'og:image', content: 'https://aspire.dev/og-image.png' } },
				{ tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
				{ tag: 'meta', attrs: { property: 'og:site_name', content: 'Aspire' } },
				
				// Twitter Card meta tags
				{ tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
				{ tag: 'meta', attrs: { property: 'twitter:domain', content: 'aspire.dev' } },
				{ tag: 'meta', attrs: { property: 'twitter:url', content: 'https://aspire.dev' } },
				{ tag: 'meta', attrs: { name: 'twitter:title', content: 'Aspire—Your Stack, Streamlined' } },
				{ tag: 'meta', attrs: { name: 'twitter:description', content: 'Aspire (formerly .NET Aspire) streamlines your development workflow with code-first control, modularity, and observability.' } },
				{ tag: 'meta', attrs: { name: 'twitter:image', content: 'https://aspire.dev/og-image.png' } },
				
				// Favicons and icons (ordered: SVG → PNG → ICO → Apple Touch Icon)
				{ tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' } },
				{ tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' } },
				{ tag: 'link', attrs: { rel: 'shortcut icon', href: '/favicon.ico' } },
				{ tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' } },
				{ tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Aspire' } },
				{ tag: 'link', attrs: { rel: 'alternate', type: 'application/rss+xml', title: 'Aspire Docs RSS', href: '/rss.xml' } },
				{ tag: 'script', attrs: { src: 'https://js.monitor.azure.com/scripts/c/ms.analytics-web-3.min.js', defer: true } },
				{ tag: 'script', attrs: { src: '/1ds/', defer: true } }
			],
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/dotnet/aspire'
				},
				{
					icon: 'discord',
					label: 'Discord',
					href: 'https://discord.com/invite/raNPcaaSj8'
				},
				{
					icon: 'x.com',
					label: 'X',
					href: 'https://x.com/aspiredotdev'
				},
				{
					icon: 'blueSky',
					label: 'BlueSky',
					href: 'https://bsky.app/profile/aspire.dev'
				},
				{
					icon: 'youtube',
					label: 'YouTube',
					href: 'https://www.youtube.com/@aspiredotdev'
				},
				{
					icon: 'twitch',
					label: 'Twitch',
					href: 'https://www.twitch.tv/aspiredotdev'
				}
			],
			customCss: [
				'@fontsource-variable/outfit',
				'./src/styles/site.css',
			],
			components: {
				EditLink: './src/components/starlight/EditLink.astro',
				Footer: './src/components/starlight/Footer.astro',
				Head: './src/components/starlight/Head.astro',
				Header: './src/components/starlight/Header.astro',
				Hero: './src/components/starlight/Hero.astro',
				MarkdownContent: './src/components/starlight/MarkdownContent.astro',
				Pagination: './src/components/starlight/Pagination.astro',
				Search: './src/components/starlight/Search.astro',
				Sidebar: './src/components/starlight/Sidebar.astro',
				SocialIcons: './src/components/starlight/SocialIcons.astro',
			},
			expressiveCode: {
				// https://expressive-code.com/guides/themes/#using-bundled-themes
				themes: ['laserwave', 'slack-ochin'],
				styleOverrides: { borderRadius: '0.5rem', codeFontSize: '1rem' }
			},
			plugins: [
				lunaria({
					route: "/i18n",
					sync: false
				}),
				catppuccin(),
				starlightSidebarTopics(sidebarTopics, {
					exclude: ['**/includes/**/*']
				}),
				...(process.env.CHECK_LINKS
					? [starlightLinksValidator({
						errorOnRelativeLinks: false,
						errorOnFallbackPages: false
					})]
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
					}
				}),
				starlightGitHubAlerts(),
				starlightLlmsTxt({
					projectName: 'Aspire',
					description: 'Aspire is a polyglot local dev-time orchestration tool chain for building, running, debugging, and deploying distributed applications.',
					exclude: [
						'reference/api/**',
						'/reference/api/**',
						'**/api/**'
					]
				}),
				starlightImageZoom({
					showCaptions: true
				}),
				starlightKbd({
					types: [
						{ id: 'mac', label: 'macOS' },
						{ id: 'windows', label: 'Windows', default: true },
						{ id: 'linux', label: 'Linux' },
					],
				}),
				starlightGiscus({
					repo: 'IEvangelist/aspire-docs-discussions',
					repoId: 'R_kgDOPYdXEQ',
					category: 'General',
					categoryId: 'DIC_kwDOPYdXEc4Ctyny',
					mapping: 'pathname',
					inputPosition: 'bottom',
					reactions: true,
					lazy: true,
					theme: {
						light: 'catppuccin_latte',
						dark: 'catppuccin_mocha'
					}
				})
			],
		})
	]
});
