import type { DocSearchClientOptions } from '@astrojs/starlight-docsearch';
import { createElement } from 'preact';

// Both appId and apiKey are considered public info.
export default {
  appId: 'CDBTET76S0',
  apiKey: '9d632dcd5f26ef42a4818fb0d536326b',
  indexName: 'Aspire docs',
  insights: true,
  transformItems(items) {
    return items.map((item) => {
      // Rewrite aspire.dev URLs to current host when running locally
      if (typeof location !== 'undefined' && location.hostname === 'localhost') {
        const url = new URL(item.url);
        url.protocol = location.protocol;
        url.host = location.host;
        return { ...item, url: url.href };
      }
      return item;
    });
  },
  resultsFooterComponent() {
    return createElement(
      'div',
      { className: 'api-search-notice' },
      createElement('p', { className: 'api-search-notice-text' },
        'API references are intentionally omitted from this search. To find API references, please search these dedicated API pages instead:',
      ),
      createElement(
        'div',
        { className: 'api-search-notice-buttons' },
        createElement('a', { href: `${import.meta.env.BASE_URL}reference/api/csharp/`, className: 'api-search-btn' }, 'C# API Reference'),
        createElement('a', { href: `${import.meta.env.BASE_URL}reference/api/typescript/`, className: 'api-search-btn' }, 'TypeScript API Reference'),
      ),
    );
  },
} satisfies DocSearchClientOptions;
