import type { DevResource } from './resource-types';
import type { ResourceImages } from './resource-image';
import { resourcePresentation } from './resource-presentation';
import { resourceFacetLabel, resourceSearchEntry } from './resource-search';
import { getTopic } from './topics';
import aspireLogo from '@assets/aspire-logo-32.svg';
import csharpIcon from '@assets/icons/csharp.svg';
import typescriptIcon from '@assets/icons/typescript.svg';
import javascriptIcon from '@assets/icons/javascript.svg';
import pythonIcon from '@assets/icons/python.svg';
import goIcon from '@assets/icons/go.svg';
import javaIcon from '@assets/icons/java.svg';
import rustIcon from '@assets/icons/rust.svg';

const iconClasses: Record<string, string> = {
  'open-book': 'i-mdi:book-open-page-variant-outline',
  rocket: 'i-mdi:rocket-launch-outline',
  pencil: 'i-mdi:pencil-outline',
  laptop: 'i-mdi:laptop',
  puzzle: 'i-mdi:puzzle-outline',
  warning: 'i-mdi:alert-outline',
  notes: 'i-mdi:notebook-outline',
  youtube: 'i-mdi:youtube',
  twitch: 'i-mdi:twitch',
  document: 'i-mdi:file-document-outline',
  'seti:config': 'i-mdi:cog-outline',
  'seti:powershell': 'i-mdi:console-line',
  'seti:docker': 'i-mdi:docker',
};
const languageIcons: Record<string, ImageMetadata | undefined> = {
  csharp: csharpIcon, typescript: typescriptIcon, javascript: javascriptIcon,
  python: pythonIcon, go: goIcon, java: javaIcon, rust: rustIcon,
};

export function resourceCardHtml(resource: DevResource, image?: ResourceImages): string {
  const presentation = resourcePresentation(resource);
  const topic = getTopic(resource.topics[0]);
  const titleId = `resource-${encodeURIComponent(resource.id)}`;
  const grainSeed = Array.from(resource.id).reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const grainEdge = grainSeed % 4;
  const grainX = grainEdge === 0 ? 0 : grainEdge === 1 ? 100 : (grainSeed >>> 2) % 101;
  const grainY = grainEdge === 2 ? 0 : grainEdge === 3 ? 100 : (grainSeed >>> 9) % 101;
  const languages = [...new Set(resource.languages.map((language) => language.toLowerCase()))];
  const languageDescriptionId = `${titleId}-languages`;
  const artwork = !image || resource.image?.kind === 'logo';
  const external = resource.href.startsWith('https://');
  const date = resource.date && new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(resource.date));
  const preview = image && !artwork
    ? imageHtml(image, 640, 360)
    : !image && presentation.identifier
      ? `<div class="browse-artwork-detail" aria-hidden="true">${presentation.variant === 'release'
          ? imageHtml({ light: aspireLogo.src, dark: aspireLogo.src }, 32, 32, 'resource-artwork-detail-image')
          : iconHtml(presentation.icon, 'resource-artwork-detail-icon')}<code data-search-highlight>${text(presentation.identifier)}</code></div>`
      : `<div class="browse-artwork-symbol" aria-hidden="true">${image ? imageHtml(image, 80, 80) : iconHtml(presentation.icon, 'resource-artwork-icon')}</div>`;
  const languageBadges = languages.length
    ? `<span class="browse-card-languages"><span class="sr-only" id="${attribute(languageDescriptionId)}">Languages: ${text(languages.map(resourceFacetLabel).join(', '))}</span>${languages.map((language) => {
        const icon = languageIcons[language];
        return `<span class="browse-language" data-resource-language="${attribute(language)}" title="${attribute(resourceFacetLabel(language))}" aria-hidden="true">${icon
          ? imageHtml({ light: icon.src, dark: icon.src }, 18, 18, 'browse-language-image')
          : `<span>${text(resourceFacetLabel(language))}</span>`}</span>`;
      }).join('')}</span>`
    : '';
  const meta = date || external
    ? `<div class="browse-card-meta">${date ? `<time datetime="${attribute(resource.date!)}">${text(date)}</time>` : ''}${external ? iconHtml('external', 'resource-external-icon') : ''}</div>`
    : '';

  return `<li class="browse-result" data-resource-entry="${attribute(JSON.stringify(resourceSearchEntry(resource)))}" data-resource-type="${attribute(resource.type)}" style="--resource-accent: ${attribute(topic?.color ?? 'var(--sl-color-purple)')}; --grain-x: ${grainX}%; --grain-y: ${grainY}%"><a class="browse-card${external ? ' external-link' : ''}" data-underline-trigger href="${attribute(resource.href)}" aria-labelledby="${attribute(titleId)}"${languages.length ? ` aria-describedby="${attribute(languageDescriptionId)}"` : ''}><div class="browse-card-preview${artwork ? ' browse-card-artwork' : ''}" data-artwork="${attribute(presentation.variant)}">${preview}<div class="browse-card-badges"><span class="browse-card-kind">${iconHtml(presentation.icon, 'resource-kind-icon')}<span>${text(presentation.label)}</span></span>${languageBadges}</div></div><div class="browse-card-copy"><h3 id="${attribute(titleId)}"><span data-link-underline data-search-highlight>${text(resource.title)}</span></h3><p data-search-highlight>${text(resource.description)}</p>${meta}</div></a></li>`;
}

function imageHtml(image: ResourceImages, width: number, height: number, className = ''): string {
  const classes = ['resource-image', className].filter(Boolean).join(' ');
  const markup = image.light === image.dark
    ? `<img class="${classes}" src="${attribute(image.light)}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async">`
    : `<img class="${classes} browse-image-light" src="${attribute(image.light)}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async"><img class="${classes} browse-image-dark" src="${attribute(image.dark)}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async">`;
  // Astro removes noscript nodes from incoming pages before a client-side swap.
  return `<template data-resource-image>${markup}</template><noscript>${markup}</noscript>`;
}

function iconHtml(name: string, className: string): string {
  const icon = name === 'external' ? 'i-mdi:open-in-new' : iconClasses[name] ?? 'i-mdi:file-outline';
  return `<span class="${className} ${icon}" aria-hidden="true"></span>`;
}

function text(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function attribute(value: string): string {
  return text(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
