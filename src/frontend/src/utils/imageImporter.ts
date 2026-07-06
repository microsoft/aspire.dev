/**
 * This module provides functions to help with image importing in Astro.
 * It solves the problem of dynamic imports from JSON data.
 */

import type { ImageMetadata } from 'astro';

type ImportedImageModule = {
  default: ImageMetadata;
};

type AvatarPath = string | null | undefined;

type AvatarItem = {
  avatar: AvatarPath;
  [key: string]: unknown;
};

// Import all images from the testimonials directory
// This uses Vite's import.meta.glob feature
const testimonialImages = import.meta.glob<ImportedImageModule>(
  '../assets/testimonials/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
  }
);

/**
 * Get an imported image by path
 */
export function getImageByPath(path: AvatarPath): ImageMetadata | AvatarPath {
  if (!path || typeof path !== 'string' || !path.startsWith('../assets/')) {
    return path;
  }

  const importedImage = testimonialImages[path];

  return importedImage?.default || path;
}

/**
 * Process an array of objects with avatar properties to use imported images
 */
export function processAvatars<T extends AvatarItem>(
  items: T[]
): Array<Omit<T, 'avatar'> & { avatar: ImageMetadata | AvatarPath }> {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    if (!item || typeof item !== 'object') return item;

    return {
      ...item,
      avatar: getImageByPath(item.avatar),
    };
  });
}
