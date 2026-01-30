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
        'Aspire is a polyglot local dev-time orchestration tool chain for building, running, debugging, and deploying distributed applications.',
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
					C#, csharp, polyglot, python, go, node.js, javascript, typescript,
					vite, react, blazor, wasm, webassembly, aspnetcore, minimal apis,
					docker, containers, kubernetes, compose
				`
        .replace(/\s*\n\s*/g, ' ')
        .trim(),
    },
  },
  { tag: 'meta', attrs: { name: 'alternate-name', content: '.NET Aspire' } },

  // Open Graph meta tags
  { tag: 'meta', attrs: { property: 'og:title', content: 'Aspire—Your Stack, Streamlined' } },
  {
    tag: 'meta',
    attrs: {
      property: 'og:description',
      content:
        'Aspire streamlines your development workflow with code-first control, modularity, and observability for distributed applications.',
    },
  },
  { tag: 'meta', attrs: { property: 'og:image', content: 'https://aspire.dev/og-image.png' } },
  { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
  { tag: 'meta', attrs: { property: 'og:site_name', content: 'Aspire' } },

  // Twitter Card meta tags
  { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
  { tag: 'meta', attrs: { property: 'twitter:domain', content: 'aspire.dev' } },
  { tag: 'meta', attrs: { property: 'twitter:url', content: 'https://aspire.dev' } },
  { tag: 'meta', attrs: { name: 'twitter:title', content: 'Aspire—Your Stack, Streamlined' } },
  {
    tag: 'meta',
    attrs: {
      name: 'twitter:description',
      content:
        'Aspire streamlines your development workflow with code-first control, modularity, and observability.',
    },
  },
  { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://aspire.dev/og-image.png' } },

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
      src: '/1ds/',
      defer: true,
      'data-category': 'analytics',
    },
  },
];
