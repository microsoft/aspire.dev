import type { APIRoute, GetStaticPaths } from 'astro';
import { fallbackLocales } from '@utils/locale-fallback';
import { getSerializedLocaleFallbackDictionaries } from '@utils/locale-fallback-dictionary';

export const prerender = true;

export const getStaticPaths = (() =>
  fallbackLocales.map((locale) => ({ params: { locale } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const dictionaries = await getSerializedLocaleFallbackDictionaries();
  return new Response(dictionaries[params.locale!], {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
