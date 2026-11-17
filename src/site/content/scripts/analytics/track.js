/* global document, window */

(function () {
  if (!window.analytics || !window.analytics.__initialized) {
    return;
  }

  if (window.analytics.__trackingBound) {
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
        var key = attr.name.substring('data-track-'.length).replace(/-([a-z])/g, function (_, c) {
          return c.toUpperCase();
        });
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
    } catch (err) {
      console.warn('[track] Failed to track event:', err);
    }
  });

})();
