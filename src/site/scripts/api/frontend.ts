// Loads the API reference utilities of src/frontend/src/utils outside Astro, without changing them.
//
// Importing this module registers astro-hooks.mjs (an `astro:content` stand-in reading the JSON data, and the
// production `import.meta.env`). Utilities must then be imported dynamically, through `frontendModule`, so they
// load after the hooks are in place.

import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../../../..');
export const frontendRoot = path.join(repoRoot, 'src/frontend');
export const siteRoot = path.join(repoRoot, 'src/site');

register('./astro-hooks.mjs', import.meta.url, {
  data: {
    contentShimUrl: pathToFileURL(path.join(here, 'astro-content.mjs')).href,
    frontendSrcUrl: pathToFileURL(path.join(frontendRoot, 'src')).href + '/',
    env: { PROD: true, DEV: false, SSR: true, MODE: 'production', BASE_URL: '/' },
  },
});

/** Imports a module of src/frontend/src by its path relative to that folder (e.g. `utils/packages.ts`). */
export function frontendModule<T>(relativePath: string): Promise<T> {
  return import(pathToFileURL(path.join(frontendRoot, 'src', relativePath)).href) as Promise<T>;
}

/* ---- What src/frontend/src/components/ApiReference.astro renders (a component cannot be imported) ---- */

/** `formatTitle` of ApiReference.astro. */
export function formatTitle(title: string | undefined): string | undefined {
  if (!title || title.length <= 160) return title;

  const prefix = title.slice(0, 157);
  const text = /\s/.test(title[157]) ? prefix : prefix.replace(/\s+\S*$/, '');
  return `${text.trimEnd()}...`;
}

export interface ApiReferenceTargetLike {
  label: string;
  path?: string;
  description?: string;
}

export interface ApiReferenceResolutionLike {
  status: 'resolved' | 'missing' | 'ambiguous';
  targets?: Record<string, ApiReferenceTargetLike>;
  diagnostics: { message: string }[];
  csharp: ApiReferenceTargetLike;
  typescript: ApiReferenceTargetLike;
}

/** One language link of an `<ApiReference>`: its text, its href (absent: plain code) and its tooltip. */
export interface RenderedApiReferenceLink {
  label: string;
  path?: string;
  title?: string;
}

export interface RenderedApiReference {
  status: ApiReferenceResolutionLike['status'];
  csharp: RenderedApiReferenceLink;
  typescript: RenderedApiReferenceLink;
}

const apiReferenceLanguages = [
  { id: 'csharp', displayName: 'C#' },
  { id: 'typescript', displayName: 'TypeScript' },
] as const;

/** The values ApiReference.astro computes from a resolution (with BASE_URL `/`, so href = path). */
export function renderApiReference(resolution: ApiReferenceResolutionLike): RenderedApiReference {
  const diagnosticText = resolution.diagnostics.map((diagnostic) => diagnostic.message).join(' ');
  const rendered = { status: resolution.status } as RenderedApiReference;
  for (const { id, displayName } of apiReferenceLanguages) {
    const target =
      resolution.targets?.[id] ?? (id === 'csharp' ? resolution.csharp : resolution.typescript);
    const href = target.path ? target.path : undefined;
    const diagnostic = href
      ? undefined
      : resolution.status === 'resolved' && resolution.diagnostics.length === 0
        ? undefined
        : diagnosticText;
    const title = href
      ? formatTitle(target.description ?? `${target.label} — ${displayName} API reference`)
      : formatTitle(diagnostic);
    const link: RenderedApiReferenceLink = { label: target.label };
    if (href) link.path = href;
    if (title !== undefined) link.title = title;
    rendered[id] = link;
  }
  return rendered;
}
