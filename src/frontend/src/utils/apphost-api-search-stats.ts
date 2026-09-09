import type { AppHostApiSearchEntry } from './apphost-api-search';
import type { AppHostLanguageId } from './apphost-languages';

export interface AppHostApiSearchStats {
  packageCount: number;
  capabilityCount: number;
  typeCount: number;
}

const capabilityKinds = new Set(['function', 'method', 'property']);

export function getAppHostApiSearchStats(
  index: ReadonlyArray<AppHostApiSearchEntry>,
  language: AppHostLanguageId,
  versions: ReadonlySet<string> | null = null
): AppHostApiSearchStats {
  const visibleEntries = index.filter(
    (entry) =>
      entry.l === language &&
      (versions === null || (entry.v !== undefined && versions.has(entry.v)))
  );

  return {
    packageCount: new Set(visibleEntries.map((entry) => entry.p)).size,
    capabilityCount: visibleEntries.filter((entry) => capabilityKinds.has(entry.k)).length,
    typeCount: visibleEntries.filter((entry) => !capabilityKinds.has(entry.k)).length,
  };
}

export function formatAppHostApiSearchStats(stats: AppHostApiSearchStats): string {
  return `${stats.capabilityCount.toLocaleString()} capabilities and ${stats.typeCount.toLocaleString()} types across ${stats.packageCount.toLocaleString()} modules`;
}
