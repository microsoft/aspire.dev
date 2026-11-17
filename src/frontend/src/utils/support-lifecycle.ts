import type { OgImageDetail } from './og-image-renderer.ts';

/**
 * Reads the release tables and the "Last updated" badge from the
 * hand-maintained `support.mdx` so the support page's social card always
 * shows the same release details as the page itself, with no second source
 * of truth to keep in sync.
 *
 * Tables are matched by the heading above them and by column header name, so
 * adding a column or reordering columns does not break the parser.
 */

export interface SupportRelease {
  version: string;
  releaseDate: string;
  latestPatch: string;
  patchDate: string;
  endOfSupport: string;
}

export interface SupportLifecycle {
  lastUpdated?: string;
  supported: SupportRelease[];
  outOfSupport: SupportRelease[];
}

const COLUMNS: Record<string, keyof SupportRelease> = {
  version: 'version',
  'original release date': 'releaseDate',
  'latest patch version': 'latestPatch',
  'patch release date': 'patchDate',
  'end of support': 'endOfSupport',
};

const HEADING = /^#{2,6}\s+(.+?)\s*$/;
const SEPARATOR_CELL = /^:?-+:?$/;
const LAST_UPDATED = /Last updated:\s*([A-Za-z]+ \d{1,2}, \d{4})/;

export function parseSupportLifecycle(markdown: string): SupportLifecycle {
  const lifecycle: SupportLifecycle = {
    lastUpdated: LAST_UPDATED.exec(markdown)?.[1],
    supported: [],
    outOfSupport: [],
  };

  let target: SupportRelease[] | undefined;
  let columns: Array<keyof SupportRelease | undefined> | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      target = tableTarget(heading[1], lifecycle);
      columns = undefined;
      continue;
    }

    if (!target || !line.trimStart().startsWith('|')) continue;

    const cells = splitRow(line);
    if (cells.every((cell) => SEPARATOR_CELL.test(cell))) continue;

    if (!columns) {
      columns = cells.map((cell) => COLUMNS[cell.toLowerCase()]);
      continue;
    }

    const release: SupportRelease = {
      version: '',
      releaseDate: '',
      latestPatch: '',
      patchDate: '',
      endOfSupport: '',
    };
    cells.forEach((cell, index) => {
      const column = columns?.[index];
      if (column) release[column] = cell;
    });
    if (release.version) target.push(release);
  }

  return lifecycle;
}

/**
 * Build the fact-sheet rows for the support page's social card. Rows whose
 * source cells are missing are dropped rather than rendered half-empty.
 */
export function buildSupportOgDetails({
  supported,
  outOfSupport,
  lastUpdated,
}: SupportLifecycle): OgImageDetail[] {
  const [current] = supported;
  const [newestEnded] = outOfSupport;

  const rows: Array<[label: string, value: string | undefined]> = [
    [
      'Supported',
      joinParts(current?.version, current?.releaseDate && `released ${current.releaseDate}`),
    ],
    ['Latest patch', joinParts(current?.latestPatch, current?.patchDate)],
    ['Support ends', current?.endOfSupport.replace(/\.$/, '')],
    ['Out of support', newestEnded && `${newestEnded.version} and earlier`],
    ['Last updated', lastUpdated],
  ];

  return rows.flatMap(([label, value]) => (value ? [{ label, value }] : []));
}

function tableTarget(heading: string, lifecycle: SupportLifecycle): SupportRelease[] | undefined {
  const text = heading.toLowerCase();
  if (text.includes('out of support')) return lifecycle.outOfSupport;
  if (text.includes('supported versions')) return lifecycle.supported;
  return undefined;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(plainText);
}

function plainText(cell: string): string {
  return cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .trim();
}

function joinParts(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' · ');
}
