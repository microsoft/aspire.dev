import { defineMiddleware } from 'astro:middleware';
import { stripApiReferenceLocale } from './utils/api-reference-routes';

const nestedApiMarkdownPattern = /^\/reference\/api\/(?:csharp|typescript)\/.+\.md$/;
const cliConfigSchemaPattern = /^\/reference\/cli\/configuration\/schema\/[^/]+\.json$/;

function redirect(location: string, status = 308): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}

export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search } = new URL(context.request.url);

  const canonicalApiPath = stripApiReferenceLocale(pathname);
  if (canonicalApiPath) {
    return redirect(`${canonicalApiPath}${search}`);
  }

  if (nestedApiMarkdownPattern.test(pathname) || cliConfigSchemaPattern.test(pathname)) {
    return redirect(`${pathname}/${search}`);
  }

  return next();
});