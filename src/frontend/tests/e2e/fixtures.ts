import { test as base, type BrowserContext } from '@playwright/test';

export * from '@playwright/test';

// wcpstatic.microsoft.com serves a different WCP consent runtime per region. Where
// consent is required (for example, on EU-hosted CI runners) it paints a fixed banner
// across the top of the viewport that intercepts clicks and pushes the header down,
// so results would depend on where CI happens to run. Serve every test the
// "consent not required" behavior US runners receive instead. Specs that exercise
// other consent states register their own `page.route` for this host, which takes
// precedence over this context route.
const WCP_CONSENT_NOT_REQUIRED = `window.WcpConsent = {
  init: function (culture, placeholder, onInit) {
    var consent = { Required: true, Analytics: true, SocialMedia: true, Advertising: true };
    if (onInit) {
      onInit(undefined, {
        isConsentRequired: false,
        getConsent: function () { return Object.assign({}, consent); },
        getConsentFor: function (category) { return consent[category]; },
        manageConsent: function () {},
        onConsentChanged: function () {},
      });
    }
  },
};`;

export async function stubWcpConsent(context: BrowserContext): Promise<void> {
  await context.route(/wcpstatic\.microsoft\.com/, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: WCP_CONSENT_NOT_REQUIRED })
  );
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await stubWcpConsent(context);
    await use(context);
  },
});
