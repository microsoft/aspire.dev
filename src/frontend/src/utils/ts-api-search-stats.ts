export interface TsApiSearchIndexEntry {
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

export interface TsApiSearchStats {
  packageCount: number;
  capabilityCount: number;
  typeCount: number;
}

const capabilityKinds = new Set(['function', 'method', 'property']);

export function getTsApiSearchStats(
  index: ReadonlyArray<TsApiSearchIndexEntry>,
  versions: ReadonlySet<string> | null = null
): TsApiSearchStats {
  const visibleEntries = versions === null
    ? index
    : index.filter((entry) => entry.v && versions.has(entry.v));

  return {
    packageCount: new Set(visibleEntries.map((entry) => entry.p)).size,
    capabilityCount: visibleEntries.filter((entry) => capabilityKinds.has(entry.k)).length,
    typeCount: visibleEntries.filter((entry) => !capabilityKinds.has(entry.k)).length,
  };
}

export function formatTsApiSearchStats(stats: TsApiSearchStats): string {
  return `${stats.capabilityCount.toLocaleString()} capabilities and ${stats.typeCount.toLocaleString()} types across ${stats.packageCount.toLocaleString()} modules`;
}