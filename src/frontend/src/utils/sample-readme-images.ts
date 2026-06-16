import type { Token, Tokens } from 'marked';

import { sampleImageTheme } from '@utils/samples';

function isWhitespaceTextToken(token: Token): boolean {
  if (token.type !== 'text') {
    return false;
  }

  const text = (token as Token & { text?: unknown }).text;
  return typeof text === 'string' && text.trim() === '';
}

export function getStandaloneImageTokens(token: Token): Tokens.Image[] | null {
  if (token.type !== 'paragraph') {
    return null;
  }

  const paragraph = token as Tokens.Paragraph;
  const tokens = paragraph.tokens ?? [];
  const imageTokens = tokens.filter((child) => child.type === 'image') as Tokens.Image[];
  const hasOnlyImagesAndWhitespace = tokens.every(
    (child) => child.type === 'image' || isWhitespaceTextToken(child)
  );

  if (!hasOnlyImagesAndWhitespace || imageTokens.length === 0) {
    return null;
  }

  return imageTokens;
}

export function getThemeImageTokenPair(
  imageTokens: readonly Tokens.Image[]
): { light: Tokens.Image; dark: Tokens.Image } | null {
  if (imageTokens.length !== 2) {
    return null;
  }

  const [first, second] = imageTokens;
  const firstTheme = sampleImageTheme(first.href);
  const secondTheme = sampleImageTheme(second.href);

  if (!firstTheme || !secondTheme || firstTheme === secondTheme) {
    return null;
  }

  return firstTheme === 'light' ? { light: first, dark: second } : { light: second, dark: first };
}

export function isStandaloneSampleImageBlock(token: Token): boolean {
  const imageTokens = getStandaloneImageTokens(token);
  if (!imageTokens) {
    return false;
  }

  return imageTokens.length === 1 || getThemeImageTokenPair(imageTokens) !== null;
}
