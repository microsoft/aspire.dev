/* global document, location, oneDS, window */

(function () {
  function isNotFoundPage() {
    return Boolean(
      document.querySelector('[data-funnel="not_found_recovery"][data-funnel-view]')
    );
  }

  function sanitizeTelemetryUrl(value) {
    if (typeof value !== 'string' || !value) return value;

    try {
      const url = new URL(value, location.origin);
      if (
        isNotFoundPage() &&
        url.origin === location.origin &&
        url.pathname === location.pathname
      ) {
        url.pathname = '/404/';
      }
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch (err) {
      console.debug('[1ds] Dropping invalid telemetry URL:', err);
      return '';
    }
  }

  function sanitizeTelemetryUrls(item) {
    [item && item.baseData, item && item.data].forEach(function (properties) {
      if (!properties) return;

      ['uri', 'targetUri', 'refUri', 'referrerUri'].forEach(function (property) {
        if (property in properties) {
          properties[property] = sanitizeTelemetryUrl(properties[property]);
        }
      });
    });
  }

  function getTelemetryPageName() {
    if (isNotFoundPage()) return '404';

    const segments = location.pathname.split('/').filter(Boolean);
    return segments.length ? segments[segments.length - 1] : 'Home';
  }

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
        instrumentationKey:
          '1c6ad99c3e274af7881b9c3c78eed459-573e6b44-ab25-4e60-97ad-7b7f38f0243a-6923',
        channelConfiguration: { eventsLimitInMem: 50 },
        propertyConfiguration: { env: 'PROD' },
        webAnalyticsConfiguration: {
          urlCollectQuery: false,
          callback: { pageName: getTelemetryPageName },
          autoCapture: {
            scroll: true,
            pageView: false,
            onLoad: false,
            onUnload: true,
            click: true,
            resize: true,
            jsError: false,
          },
        },
      },
      []
    );

    analytics.addTelemetryInitializer(sanitizeTelemetryUrls);
    analytics.capturePageView({ isAuto: true });

    const captureLoadEvents = function () {
      analytics.capturePageViewPerformance({ isAuto: true });
      analytics.captureContentUpdate({ isAuto: true, isDomComplete: true });
    };
    if (document.readyState === 'complete') {
      captureLoadEvents();
    } else {
      window.addEventListener('load', captureLoadEvents, { once: true });
    }

    analytics.__initialized = true;
    window.analytics = analytics;
  } catch (err) {
    console.debug('[1ds] Failed to initialize Application Insights:', err);
  }
})();
