import { defineConfig } from 'unocss';
import { presetStarlightIcons } from 'starlight-plugin-icons/uno';

export default defineConfig({
  presets: [presetStarlightIcons()],
  safelist: [
    'i-mdi:page-first',
    'i-mdi:page-last',
    'i-mdi:sort-calendar-ascending',
    'i-mdi:sort-calendar-descending',
    'i-mdi:sort-alphabetical-ascending',
    'i-mdi:sort-alphabetical-descending',
  ],
});
