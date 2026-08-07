import { expect, test, type Page } from '@playwright/test';

// The analytics scripts ship inert (`type="text/plain"`) and are promoted to
// executable at runtime once WCP reports Analytics consent. These selectors let
// us assert on that promotion without depending on which script sources exist.
const ANALYTICS_SELECTOR = 'script[data-category="analytics"]';
const INERT_ANALYTICS_SELECTOR = 'script[type="text/plain"][data-category="analytics"]';
const EXECUTABLE_ANALYTICS_SELECTOR = 'script[data-category="analytics"]:not([type="text/plain"])';
const MANAGE_TRIGGER_SELECTOR = '[data-cookie-manage-consent]';

// astro dev fires a one-time full-page reload once Vite finishes pre-bundling
// dependencies on a cold server, which can destroy the page's execution context
// mid-assertion. Poll generously and evaluate defensively so that reload never
// makes these tests flaky. (CI serves the built site via `astro preview`, where
// this reload does not happen.)
const POLL_TIMEOUT = 20_000;

type WcpStubOptions = {
  /** Whether WCP reports the visitor's region as requiring a consent choice. */
  consentRequired: boolean;
  /** Whether the stubbed consent record grants the Analytics category. */
  analyticsGranted: boolean;
};

// WCP is a consent-collection API loaded from Microsoft's CDN; it exposes a
// global `window.WcpConsent` whose `init` hands our bootstrap a `siteConsent`
// object. Production behavior (does analytics load? do the manage buttons open
// the dialog?) is driven entirely by that object, which in turn depends on the
// runner's region — untestable against the real CDN. This installs a
// deterministic stand-in before the page's inline consent bootstrap runs and
// blocks the real library so it can't overwrite the stub.
async function installWcpStub(page: Page, options: WcpStubOptions): Promise<void> {
  // Stop the real (async) library from loading and clobbering our stub.
  await page.route(/wcpstatic\.microsoft\.com/, (route) => route.abort());
  // Once analytics scripts are promoted the browser fetches their sources.
  // Neutralize those requests so the tests never hit the real network or run
  // production analytics side effects; we only assert on the DOM promotion.
  await page.route(/js\.monitor\.azure\.com/, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' })
  );
  await page.route(/\/scripts\/analytics\//, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' })
  );

  await page.addInitScript((opts: WcpStubOptions) => {
    // WCP v2 is key-based: `siteConsent.applyTheme(name)` looks the theme up in
    // this map and throws on a miss, and `WcpConsent.themes` is a string-keyed
    // record of theme objects.
    const themes: Record<string, unknown> = { dark: {}, light: {}, 'high-contrast': {} };

    const siteConsent = {
      isConsentRequired: opts.consentRequired,
      getConsent() {
        return {
          Required: true,
          Analytics: opts.analyticsGranted,
          SocialMedia: opts.analyticsGranted,
          Advertising: opts.analyticsGranted,
        };
      },
      manageConsent() {
        const w = window as unknown as { __wcpManageConsentCalls?: number };
        w.__wcpManageConsentCalls = (w.__wcpManageConsentCalls ?? 0) + 1;
      },
      applyTheme(themeKey: unknown) {
        // Mirror the real API exactly: only a valid string key is accepted;
        // anything else (e.g. a `themes[...]` object) throws just as the live
        // library does. This is what lets the theme test catch a wrong-argument
        // regression that a permissive `applyTheme() {}` stub would silently hide.
        if (typeof themeKey !== 'string' || !(themeKey in themes)) {
          throw new Error('Theme not found error');
        }
        const w = window as unknown as {
          __wcpApplyThemeCalls?: number;
          __wcpLastAppliedTheme?: string;
        };
        w.__wcpApplyThemeCalls = (w.__wcpApplyThemeCalls ?? 0) + 1;
        w.__wcpLastAppliedTheme = themeKey;
      },
      onConsentChanged() {},
    };

    (window as unknown as { WcpConsent: unknown }).WcpConsent = {
      themes,
      init(
        _culture: string,
        _host: unknown,
        initCallback: (err: unknown, consent: typeof siteConsent) => void,
        onConsentChanged?: () => void
      ) {
        // Expose WCP's own consent-changed callback (init's 4th argument) so a
        // test can drive the consent-*changed* path, which the bootstrap handles
        // by reloading. Then mirror WCP: invoke the init callback once consent is
        // resolved so our bootstrap stores siteConsent and runs the bridge.
        (
          window as unknown as { __triggerWcpConsentChanged?: () => void }
        ).__triggerWcpConsentChanged = () => onConsentChanged?.();
        initCallback(null, siteConsent);
      },
    };
  }, options);
}

// Evaluate a page function, tolerating the transient "execution context was
// destroyed" throw that the cold-server reload can raise. Returns undefined
// when the context is gone so callers can poll until it settles.
async function safeEvaluate<T>(page: Page, fn: () => T): Promise<T | undefined> {
  try {
    return await page.evaluate(fn);
  } catch {
    return undefined;
  }
}

// Our bootstrap stores the resolved consent on `window.__aspireWcpSiteConsent`.
// Wait for it so assertions run after the consent -> DOM bridge has executed.
async function waitForConsentBootstrap(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        safeEvaluate(page, () =>
          Boolean((window as unknown as { __aspireWcpSiteConsent?: unknown }).__aspireWcpSiteConsent)
        ),
      { timeout: POLL_TIMEOUT }
    )
    .toBe(true);
}

test.describe('WCP cookie consent bridge', () => {
  test('promotes inert analytics scripts once Analytics consent is granted', async ({ page }) => {
    await installWcpStub(page, { consentRequired: false, analyticsGranted: true });
    await page.goto('/');
    await waitForConsentBootstrap(page);

    // Every previously inert analytics script must have been promoted to an
    // executable one (its neutralizing `type="text/plain"` removed). Locator
    // polls re-query the live DOM, so they ride out the cold-server reload.
    await expect
      .poll(() => page.locator(INERT_ANALYTICS_SELECTOR).count(), { timeout: POLL_TIMEOUT })
      .toBe(0);
    await expect
      .poll(
        async () => {
          const total = await page.locator(ANALYTICS_SELECTOR).count();
          const executable = await page.locator(EXECUTABLE_ANALYTICS_SELECTOR).count();
          return total > 0 && executable === total;
        },
        { timeout: POLL_TIMEOUT }
      )
      .toBe(true);
    // Execution order is load-bearing (the SDK must run before 1ds.js/track.js),
    // so the bootstrap forces `async = false` on each promoted script — otherwise
    // dynamically-created scripts default to async and race, and analytics
    // silently never initializes. Assert the flag so that fix can't regress.
    await expect
      .poll(
        () =>
          safeEvaluate(page, () => {
            const scripts = Array.from(
              document.querySelectorAll<HTMLScriptElement>(
                'script[data-category="analytics"]:not([type="text/plain"])'
              )
            );
            return scripts.length > 0 && scripts.every((script) => script.async === false);
          }),
        { timeout: POLL_TIMEOUT }
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          safeEvaluate(page, () =>
            Boolean(
              (window as unknown as { __aspireAnalyticsActivated?: boolean })
                .__aspireAnalyticsActivated
            )
          ),
        { timeout: POLL_TIMEOUT }
      )
      .toBe(true);
  });

  test('leaves analytics scripts inert while Analytics consent is withheld', async ({ page }) => {
    await installWcpStub(page, { consentRequired: true, analyticsGranted: false });
    await page.goto('/');
    await waitForConsentBootstrap(page);

    // Consent is required here, so the manage-cookies controls stay enabled.
    await expect
      .poll(
        () =>
          safeEvaluate(page, () =>
            document.documentElement.hasAttribute('data-consent-not-required')
          ),
        { timeout: POLL_TIMEOUT }
      )
      .toBe(false);

    // Nothing should have promoted the analytics scripts: every one stays inert
    // and the activation flag is never set.
    const total = await page.locator(ANALYTICS_SELECTOR).count();
    expect(total).toBeGreaterThan(0);
    await expect
      .poll(() => page.locator(INERT_ANALYTICS_SELECTOR).count(), { timeout: POLL_TIMEOUT })
      .toBe(total);
    await expect
      .poll(
        () =>
          safeEvaluate(page, () =>
            Boolean(
              (window as unknown as { __aspireAnalyticsActivated?: boolean })
                .__aspireAnalyticsActivated
            )
          ),
        { timeout: POLL_TIMEOUT }
      )
      .toBe(false);
  });

  test('routes every manage-cookies control to the WCP consent dialog', async ({ page }) => {
    await installWcpStub(page, { consentRequired: true, analyticsGranted: false });
    await page.goto('/');
    await waitForConsentBootstrap(page);

    // At least one manage-cookies control must be server-rendered (the homepage
    // ships three: the header's desktop and mobile buttons plus the footer's
    // social row). The exact count varies by page/viewport, so assert on the
    // behavior — every rendered control opens WCP's dialog — rather than a
    // brittle fixed number.
    await expect
      .poll(() => page.locator(MANAGE_TRIGGER_SELECTOR).count(), { timeout: POLL_TIMEOUT })
      .toBeGreaterThan(0);

    // Fire every control through a real DOM click and confirm each one reached
    // the single document-level handler that opens WCP's dialog. Doing the
    // reset, clicks, and read in one evaluate keeps it atomic (manageConsent
    // increments synchronously) and immune to the cold-server reload: if the
    // context is torn down mid-run the whole step simply retries.
    await expect
      .poll(
        () =>
          safeEvaluate(page, () => {
            const w = window as unknown as {
              __aspireWcpSiteConsent?: unknown;
              __wcpManageConsentCalls?: number;
            };
            if (!w.__aspireWcpSiteConsent) return false;
            w.__wcpManageConsentCalls = 0;
            const controls = document.querySelectorAll<HTMLElement>('[data-cookie-manage-consent]');
            if (controls.length === 0) return false;
            controls.forEach((el) => el.click());
            return (w.__wcpManageConsentCalls ?? 0) === controls.length;
          }),
        { timeout: POLL_TIMEOUT }
      )
      .toBe(true);
  });

  test('re-applies the WCP theme with a string key when the site theme changes', async ({
    page,
  }) => {
    await installWcpStub(page, { consentRequired: true, analyticsGranted: false });
    await page.goto('/');
    await waitForConsentBootstrap(page);

    // Toggling `data-theme` must drive `siteConsent.applyTheme` with the string
    // theme KEY. The stub throws (like the real library) on a non-key argument,
    // so if the bootstrap passed a `themes[...]` object the call would throw, get
    // swallowed, and never record — leaving `__wcpLastAppliedTheme` unset and
    // failing this poll. (A permissive stub could not catch that regression.)
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect
      .poll(
        () =>
          safeEvaluate(
            page,
            () =>
              (window as unknown as { __wcpLastAppliedTheme?: string }).__wcpLastAppliedTheme ?? null
          ),
        { timeout: POLL_TIMEOUT }
      )
      .toBe('dark');

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await expect
      .poll(
        () =>
          safeEvaluate(
            page,
            () =>
              (window as unknown as { __wcpLastAppliedTheme?: string }).__wcpLastAppliedTheme ?? null
          ),
        { timeout: POLL_TIMEOUT }
      )
      .toBe('light');
  });

  test('reloads to re-apply consent when WCP reports a consent change', async ({ page }) => {
    await installWcpStub(page, { consentRequired: true, analyticsGranted: false });
    await page.goto('/');
    await waitForConsentBootstrap(page);

    // Mark the live document so we can detect the reload. WCP invokes init's
    // 4th-arg callback when the visitor changes consent; the bootstrap responds
    // by reloading so the new choice is applied across any consent-gated behavior.
    await page.evaluate(() => {
      (window as unknown as { __preReloadMarker?: boolean }).__preReloadMarker = true;
    });
    await expect
      .poll(() =>
        safeEvaluate(
          page,
          () => (window as unknown as { __preReloadMarker?: boolean }).__preReloadMarker === true
        )
      )
      .toBe(true);

    await page.evaluate(() =>
      (
        window as unknown as { __triggerWcpConsentChanged?: () => void }
      ).__triggerWcpConsentChanged?.()
    );

    // After the reload the fresh document no longer carries the marker, and the
    // bootstrap re-runs and re-resolves consent against the new page.
    await expect
      .poll(
        () =>
          safeEvaluate(
            page,
            () => (window as unknown as { __preReloadMarker?: boolean }).__preReloadMarker === true
          ),
        { timeout: POLL_TIMEOUT }
      )
      .toBe(false);
    await waitForConsentBootstrap(page);
  });
});
