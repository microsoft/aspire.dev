import { defineMiddleware } from 'astro:middleware';

const nestedApiMarkdownPattern = /^\/reference\/api\/(?:csharp|typescript)\/.+\.md$/;

export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search } = context.url;

  if (nestedApiMarkdownPattern.test(pathname)) {
    return context.redirect(`${pathname}/${search}`, 308);
  }

  return next();
});