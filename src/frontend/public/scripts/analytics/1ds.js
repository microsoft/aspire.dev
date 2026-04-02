(function () {
  if (typeof location !== 'undefined' && location.origin !== 'https://aspire.dev') {
    console.debug('[1ds] Skipping load for origin:', location.origin);
    return;
  }

  if (typeof oneDS === 'undefined') {
    return;
  }

  if (window.analytics && window.analytics.__initialized) {
    console.debug('[1ds] Already initialized, skipping.');
    return;
  }

  try {
    const analytics = new oneDS.ApplicationInsights();
    analytics.initialize(
      {
        instrumentationKey: '1c6ad99c3e274af7881b9c3c78eed459-573e6b44-ab25-4e60-97ad-7b7f38f0243a-6923',
        channelConfiguration: { eventsLimitInMem: 50 },
        propertyConfiguration: { env: 'PROD' },
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
      },
      [],
    );

    analytics.__initialized = true;
    window.analytics = analytics;
  } catch (err) {
    console.debug('[1ds] Failed to initialize Application Insights:', err);
  }
})();