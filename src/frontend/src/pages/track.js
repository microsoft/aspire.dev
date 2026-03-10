export async function GET() {
  const js = `(function () {
      if (!window.analytics || !window.analytics.__initialized) {
        console.debug('[track] Analytics not initialized, skipping event tracking setup.');
        return;
      }

      if (window.analytics.__trackingBound) {
        console.debug('[track] Event tracking already bound, skipping.');
        return;
      }

      window.analytics.__trackingBound = true;

      document.addEventListener('click', function (e) {
        var target = e.target.closest('a[data-track], button[data-track]');
        if (!target) return;

        var eventName = target.getAttribute('data-track');
        if (!eventName) return;

        var overrides = { name: eventName };

        for (var i = 0; i < target.attributes.length; i++) {
          var attr = target.attributes[i];
          if (attr.name.startsWith('data-track-')) {
            var key = attr.name.substring('data-track-'.length)
              .replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
            overrides[key] = attr.value;
          }
        }

        if (target.tagName === 'A' && target.href) {
          overrides.href = target.href;
        }

        var text = (target.textContent || '').trim();
        if (text.length > 100) text = text.substring(0, 100);
        if (text) overrides.text = text;

        try {
          window.analytics.capturePageAction(target, overrides);
          console.debug('[track] Event tracked:', eventName, overrides);
        } catch (err) {
          console.debug('[track] Failed to track event:', err);
        }
      });

      console.debug('[track] Event tracking bound.');
    })();`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=60, s-maxage=3600, stale-while-revalidate=60',
    },
  });
}
