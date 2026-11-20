/**
 * Starlight icons that render on (nearly) every page: site chrome, sidebar topics, footer
 * socials, theme and language pickers, page actions, and common asides. Their markup is
 * served once from a shared, immutable SVG sprite instead of being inlined into ~38k pages.
 * Any other icon keeps rendering inline (see `src/components/starlight/Icon.astro`).
 *
 * After editing this list run `bun run icon-sprite` to regenerate the sprite asset.
 */
export const spriteIconNames = [
  'apple',
  'approve-check',
  'bars',
  'blueSky',
  'close',
  'discord',
  'document',
  'down-caret',
  'download',
  'email',
  'error',
  'external',
  'github',
  'heart',
  'information',
  'laptop',
  'left-arrow',
  'linux',
  'magnifier',
  'moon',
  'open-book',
  'pencil',
  'puzzle',
  'reddit',
  'right-arrow',
  'right-caret',
  'rocket',
  'rss',
  'seti:happenings',
  'seti:json',
  'seti:powershell',
  'seti:shell',
  'seti:windows',
  'setting',
  'sun',
  'translate',
  'twitch',
  'warning',
  'x.com',
  'youtube',
] as const;

const spriteIcons = new Set<string>(spriteIconNames);

export function isSpriteIcon(name: string): boolean {
  return spriteIcons.has(name);
}

/** A fragment-safe symbol id (icon names may contain `:` and `.`). */
export function spriteIconId(name: string): string {
  return `i-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** Renders the sprite for the given Starlight icon map (name -> inner SVG markup). */
export function renderIconSprite(icons: Readonly<Record<string, string>>): string {
  const symbols = spriteIconNames.map((name) => {
    const body = icons[name];
    if (body === undefined) throw new Error(`Unknown Starlight icon "${name}".`);
    return `<symbol id="${spriteIconId(name)}" viewBox="0 0 24 24">${body}</symbol>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>\n`;
}
