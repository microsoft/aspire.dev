import type { Image, PhrasingContent, RootContent } from 'mdast';

import { sampleImageTheme } from '@utils/samples';

function isWhitespacePhrasing(node: PhrasingContent): boolean {
  if (node.type === 'break') {
    return true;
  }

  return node.type === 'text' && node.value.trim() === '';
}

export function getStandaloneImageNodes(node: RootContent): Image[] | null {
  if (node.type !== 'paragraph') {
    return null;
  }

  const children = node.children;
  const imageNodes = children.filter((child): child is Image => child.type === 'image');
  const hasOnlyImagesAndWhitespace = children.every(
    (child) => child.type === 'image' || isWhitespacePhrasing(child)
  );

  if (!hasOnlyImagesAndWhitespace || imageNodes.length === 0) {
    return null;
  }

  return imageNodes;
}

export function getThemeImageNodePair(
  imageNodes: readonly Image[]
): { light: Image; dark: Image } | null {
  if (imageNodes.length !== 2) {
    return null;
  }

  const [first, second] = imageNodes;
  const firstTheme = sampleImageTheme(first.url);
  const secondTheme = sampleImageTheme(second.url);

  if (!firstTheme || !secondTheme || firstTheme === secondTheme) {
    return null;
  }

  return firstTheme === 'light' ? { light: first, dark: second } : { light: second, dark: first };
}

export function isStandaloneSampleImageBlock(node: RootContent): boolean {
  const imageNodes = getStandaloneImageNodes(node);
  if (!imageNodes) {
    return false;
  }

  return imageNodes.length === 1 || getThemeImageNodePair(imageNodes) !== null;
}
