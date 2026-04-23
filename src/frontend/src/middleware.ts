import { defineMiddleware } from 'astro:middleware';

const nestedApiMarkdownPattern = /^\/reference\/api\/(?:csharp|typescript)\/.+\.md$/;
const cliConfigSchemaPattern = /^\/reference\/cli\/configuration\/schema\/[^/]+\.json$/;

export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search } = context.url;

  if (nestedApiMarkdownPattern.test(pathname) || cliConfigSchemaPattern.test(pathname)) {
    return context.redirect(`${pathname}/${search}`, 308);
  }

  return next();
});