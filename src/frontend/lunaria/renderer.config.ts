import { defineRendererConfig, html } from '@lunariajs/core';
import { StatusByFile } from '@lunariajs/core/components';
import { TitleParagraph } from './components';

export default defineRendererConfig({
  slots: {
    afterTitle: TitleParagraph,
  },
  overrides: {
    statusByFile: (config, status) => html`
      <section class="translation-file-status" role="region" aria-labelledby="by-file" tabindex="0">
        ${StatusByFile(config, status)}
      </section>
    `,
  },
});
