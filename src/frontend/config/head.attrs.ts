export type HeadAttr = {
  tag: 'title' | 'base' | 'link' | 'style' | 'meta' | 'script' | 'noscript' | 'template';
  attrs?: Record<string, string | boolean | undefined>;
  content?: string;
};

export const headAttrs: HeadAttr[] = [
  // SEO meta tags for discoverability (including legacy ".NET Aspire" branding)
  {
    tag: 'meta',
    attrs: {
      name: 'description',
      content:
        'Aspire is a multi-language local dev-time orchestration tool chain for building, running, debugging, and deploying distributed applications.',
    },
  },
  {
    tag: 'meta',
    attrs: {
      name: 'keywords',
      content: `
					Aspire, .NET Aspire, dotnet aspire,
					distributed applications, cloud-native, microservices, orchestration,
					.NET, observability, otel, opentelemetry, dashboard, service discovery, integrations,
					C#, csharp, multi-language, polyglot, python, go, node.js, javascript, typescript,
					vite, react, blazor, wasm, webassembly, aspnetcore, minimal apis,
					docker, containers, kubernetes, compose,
					AI, MCP, model context protocol, AI coding agents, agentic development, copilot, cursor, claude code, vibe coding
				`
        .replace(/\s*\n\s*/g, ' ')
        .trim(),
    },
  },
  { tag: 'meta', attrs: { name: 'alternate-name', content: '.NET Aspire' } },

  // Open Graph / Twitter card meta tags — only truly-global tags live here.
  // Per-page `og:title`, `og:description`, `og:url`, `og:image`,
  // `og:image:alt`, `og:image:width`, `og:image:height`, `og:type`,
  // `twitter:title`, `twitter:description`, `twitter:url`, `twitter:image`,
  // and `twitter:image:alt` are emitted dynamically by
  // `src/components/starlight/Head.astro` based on each page's frontmatter
  // (see `src/utils/page-metadata.ts` for the resolution logic).
  { tag: 'meta', attrs: { property: 'og:site_name', content: 'Aspire' } },
  { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
  { tag: 'meta', attrs: { property: 'twitter:domain', content: 'aspire.dev' } },

  // Favicons and icons (ordered: SVG → PNG → ICO → Apple Touch Icon)
  { tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' } },
  {
    tag: 'link',
    attrs: { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
  },
  { tag: 'link', attrs: { rel: 'shortcut icon', href: '/favicon.ico' } },
  {
    tag: 'link',
    attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
  },
  { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Aspire' } },
  {
    tag: 'link',
    attrs: {
      rel: 'alternate',
      type: 'application/rss+xml',
      title: 'Aspire Docs RSS',
      href: '/rss.xml',
    },
  },

  // Analytics scripts
  {
    tag: 'script',
    attrs: {
      type: 'text/plain',
      src: 'https://js.monitor.azure.com/scripts/c/ms.analytics-web-3.min.js',
      defer: true,
      'data-category': 'analytics',
    },
  },
  {
    tag: 'script',
    attrs: {
      type: 'text/plain',
      src: '/scripts/analytics/1ds.js',
      defer: true,
      'data-category': 'analytics',
    },
  },
  {
    tag: 'script',
    attrs: {
      type: 'text/plain',
      src: '/scripts/analytics/track.js',
      defer: true,
      'data-category': 'analytics',
    },
  },
];
