/**
 * Determine if the current Astro request is the homepage (global or localized).
 * Mirrors logic:
 * pathname === `/${Astro.locals.starlightRoute.locale}/` || pathname === "/"
 * @param {any} Astro - The Astro global passed from a .astro file.
 * @returns {boolean}
 */
export function isHomepage(Astro) {
    const pathname = Astro?.url?.pathname || "/";
    const locale = Astro?.locals?.starlightRoute?.locale;

    return pathname === "/" || (locale ? pathname === `/${locale}/` : false);
}

/**
 * Shuffle an array using the Fisher-Yates algorithm.
 * @template T
 * @param {T[]} array - The array to shuffle.
 * @returns {T[]} - The shuffled array.
 */
export function shuffle(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Generates a friendly searchable name from an Aspire NuGet package ID.
 * Removes 'Aspire.Hosting.' prefix, replaces dots with hyphens, and converts to lowercase. Based on: https://github.com/dotnet/aspire/blob/main/src/Aspire.Cli/Commands/AddCommand.cs#L254-L261
 * 
 * @param {string} packageId - The full NuGet package ID (e.g., "Aspire.Hosting.Azure.AppContainers")
 * @returns {string} The friendly name (e.g., "azure-appcontainers")
 * 
 * @example
 * generateFriendlyName("Aspire.Hosting.Azure.Redis") // Returns: "azure-redis"
 * generateFriendlyName("Aspire.Hosting.Postgres") // Returns: "postgres"
 * generateFriendlyName("CommunityToolkit.Aspire.Hosting.Cosmos") // Returns: "communitytoolkit-cosmos"
 */
export function generateFriendlyName(packageId) {
    // Remove 'Aspire.Hosting.' segment from anywhere in the package name (case-insensitive)
    const withoutPrefix = packageId.replace(/Aspire\.Hosting\./gi, '');

    // Replace dots with hyphens and convert to lowercase
    const friendlyName = withoutPrefix.replace(/\./g, '-').toLowerCase();

    return friendlyName;
}