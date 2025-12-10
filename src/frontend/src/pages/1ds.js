const charMap = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\0': '\\0',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

function escapeUnsafeChars(str) {
  return str.replace(/[<>\b\f\n\r\t\0\u2028\u2029/\\]/g, (x) => charMap[x]);
}

export async function GET({ request }) {
  // This key is intended to be public, perfectly safe and normal.
  const key = '1c6ad99c3e274af7881b9c3c78eed459-573e6b44-ab25-4e60-97ad-7b7f38f0243a-6923';
  const env = import.meta.env.MODE === 'production' ? 'PROD' : 'PPE';

  if (env !== 'PROD') {
    const url = new URL(request.url);
    const origin = url.origin;
    if (origin !== 'https://aspire.dev') {
      const js = `(() => { console.log("[1ds] Skipping init for origin:", ${escapeUnsafeChars(JSON.stringify(origin))}); })();`;
      return new Response(js, {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }
  }

  const config = {
    instrumentationKey: key,
    channelConfiguration: { eventsLimitInMem: 50 },
    propertyConfiguration: { env },
    webAnalyticsConfiguration: {
      urlCollectQuery: true,
      autoCapture: {
        scroll: true,
        pageView: true,
        onLoad: true,
        onUnload: true,
        click: true,
        resize: true,
        jsError: true,
      },
    },
  };

  const js = `(function () {
      if (typeof location !== 'undefined' && location.origin !== 'https://aspire.dev') {
        console.debug('[1ds] Skipping load for origin:', location.origin);
        return;
      }

      if (typeof oneDS === 'undefined') {
        return;
      }
    
      try {
        const analytics = new oneDS.ApplicationInsights();

        const configJson = \`${JSON.stringify(config)}\`;
        const config = JSON.parse(configJson);

        analytics.initialize(config, []);
      } catch (err) {
        console.debug("[1ds] Failed to initialize Application Insights:", err);
      }
    })();`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=60, s-maxage=3600, stale-while-revalidate=60',
    },
  });
}
