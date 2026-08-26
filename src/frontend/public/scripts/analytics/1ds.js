/* global document, location, oneDS, window */

(function () {
  const NOT_FOUND_REFERRER_MARKER_KEY = 'aspire-last-route-not-found';

  function isNotFoundPage() {
    return Boolean(document.querySelector('[data-funnel="not_found_recovery"][data-funnel-view]'));
  }

  function consumeNotFoundReferrerMarker() {
    try {
      const wasNotFound = window.sessionStorage.getItem(NOT_FOUND_REFERRER_MARKER_KEY) === 'true';
      window.sessionStorage.removeItem(NOT_FOUND_REFERRER_MARKER_KEY);
      return wasNotFound;
    } catch (err) {
      console.debug('[1ds] Failed to read the 404 referrer marker:', err);
      return false;
    }
  }

  function rememberNotFoundRoute(notFound) {
    try {
      if (notFound) {
        window.sessionStorage.setItem(NOT_FOUND_REFERRER_MARKER_KEY, 'true');
      } else {
        window.sessionStorage.removeItem(NOT_FOUND_REFERRER_MARKER_KEY);
      }
    } catch (err) {
      console.debug('[1ds] Failed to update the 404 referrer marker:', err);
    }
  }

  let previousRouteWasNotFound = consumeNotFoundReferrerMarker();
  let currentRouteIsNotFound = isNotFoundPage();

  function sanitizeTelemetryUrl(value, isReferrer) {
    if (typeof value !== 'string' || !value) return value;

    try {
      const url = new URL(value, location.origin);
      if (
        url.origin === location.origin &&
        ((isReferrer && previousRouteWasNotFound) ||
          (currentRouteIsNotFound && url.pathname === location.pathname))
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
          properties[property] = sanitizeTelemetryUrl(
            properties[property],
            property === 'refUri' || property === 'referrerUri'
          );
        }
      });
    });
  }

  function getTelemetryPageName() {
    if (currentRouteIsNotFound) return '404';

    const segments = location.pathname.split('/').filter(Boolean);
    return segments.length ? segments[segments.length - 1] : 'Home';
  }

  function getTelemetryRouteKey(notFound) {
    return location.origin + (notFound ? '/404/' : location.pathname);
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

    let lastPageViewKey = '';
    let hasCapturedRoute = false;
    const captureRouteView = function () {
      const nextRouteIsNotFound = isNotFoundPage();
      const routeKey = getTelemetryRouteKey(nextRouteIsNotFound);
      if (routeKey === lastPageViewKey) return;

      if (hasCapturedRoute) {
        previousRouteWasNotFound = currentRouteIsNotFound;
      }
      currentRouteIsNotFound = nextRouteIsNotFound;
      lastPageViewKey = routeKey;

      analytics.capturePageView({ isAuto: true });
      if (hasCapturedRoute) {
        analytics.captureContentUpdate({ isAuto: true, isDomComplete: true });
      }

      rememberNotFoundRoute(currentRouteIsNotFound);
      hasCapturedRoute = true;
    };

    document.addEventListener('astro:page-load', captureRouteView);
    captureRouteView();

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
