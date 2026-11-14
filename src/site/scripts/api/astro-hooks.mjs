// Node module hooks that let the API reference utilities of src/frontend run outside Astro, unmodified.
//
// - `astro:content` resolves to astro-content.mjs, which serves the `packages` and `tsModules` collections
//   from the JSON files the way the glob loaders and schemas of src/frontend/src/content.config.ts do.
// - Modules under src/frontend/src that read `import.meta.env` get the values of a production build
//   (`PROD: true`, `BASE_URL: '/'`), so their memoized production code paths run.
//
// Registered by frontend.ts after tsx's own hooks, so `nextLoad` returns the JavaScript tsx compiled.

let options;

export async function initialize(data) {
  options = data;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'astro:content') {
    return { url: options.contentShimUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.startsWith(options.frontendSrcUrl) || result.source == null) {
    return result;
  }
  const source =
    typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
  if (!source.includes('import.meta.env')) {
    return result;
  }
  return {
    ...result,
    source: `import.meta.env = ${JSON.stringify(options.env)};\n${source}`,
  };
}
