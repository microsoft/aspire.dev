/**
 * Regenerates `src/assets/icons/starlight-icons.sprite.svg` from Starlight's icon set for the
 * names listed in `src/utils/icon-sprite.ts`. Run with `bun run icon-sprite`.
 */
import { writeFile } from 'node:fs/promises';
import { Icons } from '../node_modules/@astrojs/starlight/dist/components-internals/Icons';
import { renderIconSprite } from '../src/utils/icon-sprite';

const output = new URL('../src/assets/icons/starlight-icons.sprite.svg', import.meta.url);
await writeFile(output, renderIconSprite(Icons));
console.log(`Wrote ${output.pathname}`);
