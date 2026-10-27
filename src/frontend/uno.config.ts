import { defineConfig, presetIcons } from 'unocss';
import { icons as deviconIcons } from '@iconify-json/devicon';
import { presetStarlightIcons } from 'starlight-plugin-icons/uno';

export default defineConfig({
  presets: [
    presetStarlightIcons(),
    presetIcons({
      // This preset also resolves FileTree icons, so preserve Starlight's inline layout.
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
      collections: {
        devicon: deviconIcons,
      },
    }),
  ],
  safelist: [
    'i-devicon:csharp',
    'i-devicon:typescript',
    'i-devicon:python',
    'i-devicon:go-wordmark',
    'i-devicon:java',
    'i-mdi:book-open-page-variant-outline',
    'i-mdi:rocket-launch-outline',
    'i-mdi:pencil-outline',
    'i-mdi:laptop',
    'i-mdi:puzzle-outline',
    'i-mdi:alert-outline',
    'i-mdi:notebook-outline',
    'i-mdi:youtube',
    'i-mdi:twitch',
    'i-mdi:file-document-outline',
    'i-mdi:cog-outline',
    'i-mdi:console-line',
    'i-mdi:docker',
    'i-mdi:file-outline',
    'i-mdi:open-in-new',
    'i-mdi:page-first',
    'i-mdi:page-last',
    'i-mdi:sort-calendar-ascending',
    'i-mdi:sort-calendar-descending',
    'i-mdi:sort-alphabetical-ascending',
    'i-mdi:sort-alphabetical-descending',
  ],
});
