import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import logos from '@iconify-json/logos/icons.json' with { type: 'json' };
import iconoir from '@iconify-json/iconoir/icons.json' with { type: 'json' };
import { getIconData, iconToSVG, replaceIDs } from '@iconify/utils';
import { render } from 'pele';
import { create } from 'fontkitten';
import aspire from '../../public/icons/aspire.json' with { type: 'json' };

/** @type {Record<string, import('@iconify/types').IconifyJSON>} */
const packs = { logos, iconoir, aspire: { ...aspire, icons: { ...aspire.icons } } };
const localLogos = {
  'azure-app-configuration': ['azure-appconfig-icon.png'],
  'azure-app-service': ['azure-app-services.svg'],
  'azure-container-registry': ['azure-container-registry-icon.svg'],
  'azure-cosmos-db': ['azure-cosmosdb-icon.png'],
  'azure-event-hubs': ['azure-eventhubs-icon.png'],
  'azure-functions': ['azure-functionapps-icon.png'],
  'azure-key-vault': ['azure-keyvault-icon.png'],
  'azure-openai': ['azure-openai-icon.png'],
  'azure-postgresql': ['azure-postgresql-icon.png'],
  'azure-search': ['azure-search-icon.png'],
  'azure-service-bus': ['azure-servicebus-icon.png'],
  'azure-signalr': ['azure-signalr-icon.png'],
  'azure-sql': ['azure-sqlserver-icon.png'],
  'azure-storage': ['azure-storagecontainer-icon.png'],
  'azure-storage-blobs': ['azure-blobpagestorage-icon.png'],
  'azure-storage-queues': ['azure-storagequeue-icon.png'],
  'azure-storage-tables': ['azure-table-icon.png'],
  'azure-web-pubsub': ['azure-webpubsub-icon.png'],
  clickhouse: ['clickhouse-icon.png'],
  dapr: ['dapr-light-icon.png', 'dapr-icon.png'],
  'data-api-builder': ['data-api-builder-icon.png'],
  flagd: ['flagd-light-icon.svg', 'flagd-icon.svg'],
  garnet: ['garnet-icon.png'],
  'go-feature-flag': ['go-feature-flag.png'],
  kurrentdb: ['kurrent-light-icon.png', 'kurrent-icon.png'],
  k6: ['k6-icon.svg'],
  lavinmq: ['lavinmq-icon.png'],
  mailpit: ['mailpit-icon.svg', 'mailpit-light-icon.svg'],
  'microsoft-foundry': ['azure-ai-foundry-icon.png'],
  powershell: ['powershell-icon.png'],
  ravendb: ['ravendb-light-icon.png', 'ravendb-icon.png'],
  seq: ['seq-icon.png'],
  'sql-projects': ['sql-database-projects-icon.png'],
  'sql-server': ['sql-icon.png'],
};
for (const [name, files] of Object.entries(localLogos)) {
  packs.aspire.icons[name] = {
    width: 100,
    height: 100,
    body: files.map((file, index) => {
      const mime = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
      const data = readFileSync(new URL(`../assets/icons/${file}`, import.meta.url)).toString('base64');
      const theme = files.length > 1 ? ` data-theme="${index === 0 ? 'light' : 'dark'}"` : '';
      return `<image${theme} href="data:${mime};base64,${data}" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>`;
    }).join(''),
  };
}
const require = createRequire(import.meta.url);
/** @param {string} path */
function loadFont(path) {
  const font = create(readFileSync(require.resolve(path)));
  if (font.isCollection) throw new Error(`Expected a single Mermaid font: ${path}`);
  return font;
}
const regular = loadFont('@fontsource/poppins/files/poppins-latin-400-normal.woff');
const bold = loadFont('@fontsource/poppins/files/poppins-latin-700-normal.woff');
const mono = loadFont('@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2');
/** @type {import('pele').TextMeasurer} */
const measurer = {
  width(text, size, style) {
    // Pele's generic server metrics underestimate Poppins and crowd group heading icons.
    const font = style & 4 ? mono : style & 1 ? bold : regular;
    return font.glyphsForString(text).reduce((width, glyph) => width + glyph.advanceWidth, 0)
      * size / font.unitsPerEm;
  },
};
let nextId = 0;

/** @param {string} source */
export function renderMermaid(source) {
  const idPrefix = `aspire-pele-${++nextId}`;
  return render(source, {
    idPrefix,
    fontFamily: 'Poppins, sans-serif',
    fontFamilyMono: 'Fira Code Variable, monospace',
    fontSize: 16,
    measurer,
    autoDirection: false,
    config: { architecture: { iconSize: 100, padding: 44 } },
    icons(name) {
      if (!name.includes(':')) return null;
      const [prefix, key] = name.split(':');
      const pack = packs[prefix];
      const icon = pack && getIconData(pack, key);
      if (!icon) throw new Error(`Unknown Mermaid icon: ${name}`);
      const { attributes, body } = iconToSVG(icon);
      const viewBox = attributes.viewBox;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor" stroke="none">${replaceIDs(body, `${idPrefix}-${prefix}-${key}-`)}</svg>`;
    },
  }).svg;
}
