// Ported from src/frontend/src/utils/ts-api-search-stats.ts (plain ES module, loaded unbundled by scripts/client/api/index.js).
const capabilityKinds = new Set(['function', 'method', 'property']);
export function getTsApiSearchStats(index, versions = null) {
    const visibleEntries = versions === null
        ? index
        : index.filter((entry) => entry.v && versions.has(entry.v));
    return {
        packageCount: new Set(visibleEntries.map((entry) => entry.p)).size,
        capabilityCount: visibleEntries.filter((entry) => capabilityKinds.has(entry.k)).length,
        typeCount: visibleEntries.filter((entry) => !capabilityKinds.has(entry.k)).length,
    };
}
export function formatTsApiSearchStats(stats) {
    return `${stats.capabilityCount.toLocaleString()} capabilities and ${stats.typeCount.toLocaleString()} types across ${stats.packageCount.toLocaleString()} modules`;
}
