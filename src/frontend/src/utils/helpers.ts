/**
 * Determine if the current Astro request is the homepage (global or localized).
 * Mirrors logic:
 * pathname === `/${Astro.locals.starlightRoute.locale}/` || pathname === "/"
 */
interface AstroLike {
  url?: {
    pathname?: string;
  };
  locals?: {
    starlightRoute?: {
      locale?: string;
    };
  };
}

export function isHomepage(Astro: AstroLike): boolean {
  const pathname = Astro?.url?.pathname || '/';
  const locale = Astro?.locals?.starlightRoute?.locale;

  return pathname === '/' || (locale ? pathname === `/${locale}/` : false);
}

/**
 * Shuffle an array using the Fisher-Yates algorithm.
 */
export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generates a friendly searchable name from an Aspire NuGet package ID.
 * Removes 'Aspire.Hosting.' prefix, replaces dots with hyphens, and converts to lowercase. Based on: https://github.com/microsoft/aspire/blob/main/src/Aspire.Cli/Commands/AddCommand.cs#L254-L261
 *
 */
export function generateFriendlyName(packageId: string): string {
  // Remove 'Aspire.Hosting.' segment from anywhere in the package name (case-insensitive)
  const withoutPrefix = packageId.replace(/Aspire\.Hosting\./gi, '');

  // Replace dots with hyphens and convert to lowercase
  const friendlyName = withoutPrefix.replace(/\./g, '-').toLowerCase();

  return friendlyName;
}
