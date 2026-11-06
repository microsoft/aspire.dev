import logos from '@iconify-json/logos/icons.json' with { type: 'json' };
import iconoir from '@iconify-json/iconoir/icons.json' with { type: 'json' };
import { getIconData, iconToSVG, replaceIDs } from '@iconify/utils';
import { render } from 'pele';
import aspire from '../../public/icons/aspire.json' with { type: 'json' };

/** @type {Record<string, import('@iconify/types').IconifyJSON>} */
const packs = { logos, iconoir, aspire };
let nextId = 0;

/** @param {string} source */
export function renderMermaid(source) {
  const idPrefix = `aspire-pele-${++nextId}`;
  return render(source, {
    idPrefix,
    fontFamily: 'Poppins, sans-serif',
    autoDirection: false,
    config: { architecture: { iconSize: 120, fontSize: 18 } },
    icons(name) {
      if (!name.includes(':')) return null;
      const [prefix, key] = name.split(':');
      const pack = packs[prefix];
      const icon = pack && getIconData(pack, key);
      if (!icon) throw new Error(`Unknown Mermaid icon: ${name}`);
      const { attributes, body } = iconToSVG(icon);
      const viewBox = attributes.viewBox;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${replaceIDs(body, `${idPrefix}-${prefix}-${key}-`)}</svg>`;
    },
  }).svg;
}
