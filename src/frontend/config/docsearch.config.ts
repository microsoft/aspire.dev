import type { DocSearchClientOptions } from '@astrojs/starlight-docsearch';
import { createElement } from 'preact';

// Both appId and apiKey are considered public info.
export default {
  appId: 'CDBTET76S0',
  apiKey: '9d632dcd5f26ef42a4818fb0d536326b',
  indexName: 'Aspire docs',
  insights: true,
  searchParameters: {
    // Exclude API reference pages — these have dedicated search on their own pages.
    // Requires 'url' to be in attributesForFaceting in the Algolia index settings.
    filters: 'NOT url_without_anchor_path:/reference/api/',
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
        createElement('a', { href: '/reference/api/csharp/', className: 'api-search-btn' }, 'C# API Reference'),
        createElement('a', { href: '/reference/api/typescript/', className: 'api-search-btn' }, 'TypeScript API Reference'),
      ),
    );
  },
} satisfies DocSearchClientOptions;
