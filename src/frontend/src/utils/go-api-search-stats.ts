export interface GoApiSearchIndexEntry {
  n: string;
  f: string;
  k: string;
  p: string;
  s: string;
  h: string;
  t?: string;
  v?: string;
  m?: boolean;
}

export interface GoApiSearchStats {
  packageCount: number;
  capabilityCount: number;
  typeCount: number;
}

const capabilityKinds = new Set(['function', 'method', 'property']);

export function getGoApiSearchStats(
  index: ReadonlyArray<GoApiSearchIndexEntry>,
  versions: ReadonlySet<string> | null = null
): GoApiSearchStats {
  const visibleEntries = versions === null
    ? index
    : index.filter((entry) => entry.v && versions.has(entry.v));

  return {
    packageCount: new Set(visibleEntries.map((entry) => entry.p)).size,
    capabilityCount: visibleEntries.filter((entry) => capabilityKinds.has(entry.k)).length,
    typeCount: visibleEntries.filter((entry) => !capabilityKinds.has(entry.k)).length,
  };
}

export function formatGoApiSearchStats(stats: GoApiSearchStats): string {
  return `${stats.capabilityCount.toLocaleString()} capabilities and ${stats.typeCount.toLocaleString()} types across ${stats.packageCount.toLocaleString()} modules`;
}
