import { defineMiddleware } from 'astro:middleware';
import { stripApiReferenceLocale } from './utils/api-reference-routes';
import { withHybridApiCache } from './utils/hybrid-api-cache';

const nestedApiMarkdownPattern =
  /^\/reference\/(?:api\/(?:csharp|typescript)|samples)\/.+\.md$/;
const cliConfigSchemaPattern = /^\/reference\/cli\/configuration\/schema\/[^/]+\.json$/;

function redirect(location: string, status = 308): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}

export const onRequest = defineMiddleware((context, next) => {
  // Built output is always hybrid, so its on-demand renderers serve API Markdown
  // directly. `astro dev` keeps the canonicalizing `.md` -> `.md/` redirect.
  const hybridBuild = !import.meta.env.DEV;

  // These canonicalizing redirects are only meant for on-demand (SSR/dev)
  // requests. Since Astro 7.1 the middleware also runs while the `.md`/`.json`
  // API and schema endpoints are prerendered at build time; returning a
  // redirect there bakes a trailing-slash redirect stub into `dist/` that
  // shadows the real prerendered markdown/JSON body — which broke the
  // `api-markdown-routes` and `schema-routes` E2E checks. Skip the redirects
  // for prerendered routes so those endpoints emit their own content.
  if (!context.isPrerendered) {
    const { pathname, search } = new URL(context.request.url);

    const canonicalApiPath = stripApiReferenceLocale(pathname);
    if (canonicalApiPath) {
      return redirect(`${canonicalApiPath}${search}`);
    }

    const hybridApiMarkdown = hybridBuild && pathname.startsWith('/reference/api/');
    if ((!hybridApiMarkdown && nestedApiMarkdownPattern.test(pathname)) || cliConfigSchemaPattern.test(pathname)) {
      return redirect(`${pathname}/${search}`);
    }
  }

  const pathname = context.url?.pathname ?? new URL(context.request.url).pathname;
  return hybridBuild && !context.isPrerendered &&
    (pathname.startsWith('/reference/api/') || pathname === '/_image' || pathname === '/_image/')
    ? withHybridApiCache(context, next) : next();
});