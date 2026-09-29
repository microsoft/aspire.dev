import type { Image, PhrasingContent, RootContent } from 'mdast';

import { sampleImageTheme } from '@utils/samples';

function isWhitespacePhrasing(node: PhrasingContent): boolean {
  if (node.type === 'break') {
    return true;
  }

  return node.type === 'text' && node.value.trim() === '';
}

/**
 * Resolve a paragraph child down to the standalone image it represents, or
 * `null` when it isn't one.
 *
 * A bare `image` node is returned as-is. GitHub READMEs also very commonly link
 * a screenshot thumbnail to its full-size asset — `[![alt](thumb)](full)` —
 * which parses to a `link` node wrapping a single `image` (plus optional
 * whitespace). We unwrap that to the inner image so theme-aware screenshots
 * render through the sample media pipeline instead of leaking into the README
 * body as broken `<img src="~/assets/…">` tags (the `~/assets/…` alias only
 * resolves through Astro's build-time image importer, never in the browser).
 */
function asStandaloneImage(child: PhrasingContent): Image | null {
  if (child.type === 'image') {
    return child;
  }

  if (child.type === 'link') {
    let image: Image | null = null;

    for (const grandchild of child.children) {
      if (grandchild.type === 'image') {
        if (image) {
          return null;
        }

        image = grandchild;
      } else if (!isWhitespacePhrasing(grandchild)) {
        return null;
      }
    }

    return image;
  }

  return null;
}

export function getStandaloneImageNodes(node: RootContent): Image[] | null {
  if (node.type !== 'paragraph') {
    return null;
  }

  const imageNodes: Image[] = [];

  for (const child of node.children) {
    if (isWhitespacePhrasing(child)) {
      continue;
    }

    const image = asStandaloneImage(child);
    if (!image) {
      return null;
    }

    imageNodes.push(image);
  }

  return imageNodes.length > 0 ? imageNodes : null;
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
