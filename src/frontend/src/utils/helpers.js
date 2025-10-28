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