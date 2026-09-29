import { getImage } from 'astro:assets';
import type { DevResource } from './resource-types';
import { stripSampleImageUrlSuffix } from '../samples';

const assets = import.meta.glob<{ default: ImageMetadata }>('/src/assets/**/*.{png,jpg,jpeg,webp,avif}');
const imageUrls = new Map<string, Promise<string>>();
export interface ResourceImages { light: string; dark: string }

export async function resourceImages(resource: DevResource): Promise<ResourceImages | undefined> {
  if (!resource.image) return undefined;
  if (resource.image.light === resource.image.dark) {
    const url = await resourceImageUrl(resource.image.light);
    return { light: url, dark: url };
  }
  const [light, dark] = await Promise.all([
    resourceImageUrl(resource.image.light),
    resourceImageUrl(resource.image.dark),
  ]);
  return { light, dark };
}

export function resourceImageUrl(path: string): Promise<string> {
  const cached = imageUrls.get(path);
  if (cached) return cached;

  const resolved = resolveImageUrl(path);
  imageUrls.set(path, resolved);
  return resolved;
}

async function resolveImageUrl(path: string): Promise<string> {
  if (!path.startsWith('~/assets/')) return path;
  const load = assets[stripSampleImageUrlSuffix(path).replace('~/', '/src/')];
  if (!load) throw new Error(`Missing resource thumbnail: ${path}`);
  const { default: image } = await load();
  if (import.meta.env.DEV) return image.src;
  return (await getImage({ src: image, width: 640, format: 'webp' })).src;
}
