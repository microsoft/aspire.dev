import { expect, test, type Page } from '@playwright/test';

import { isNarrowViewport } from '@tests/e2e/helpers';

const SITE_TOUR_STORAGE_KEY = 'aspire-site-tour-v1';
const SITE_TOUR_TEST_PAGE = '/app-host/certificate-configuration/';
const isSiteTourEnabled = process.env.PUBLIC_ENABLE_SITE_TOUR === 'true';

type StoredSiteTourState = {
  started?: boolean;
  completed?: boolean;
  hasCompletedOnce?: boolean;
  currentStepId?: string;
  seenStepIds?: string[];
};

async function rejectCookieConsentIfVisible(page: Page): Promise<void> {
  const rejectAllButton = page.getByRole('button', { name: /reject all/i });
  if (await rejectAllButton.isVisible().catch(() => false)) {
    await rejectAllButton.click();
  }
}

async function readSiteTourState(page: Page): Promise<StoredSiteTourState | null> {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as StoredSiteTourState) : null;
  }, SITE_TOUR_STORAGE_KEY);
}

async function advanceUntilFinish(page: Page): Promise<void> {
  const nextButton = page.locator('[data-tour-action="next"]');
  const nextLabel = nextButton.locator('.aspire-site-tour-btn-label');

  for (let index = 0; index < 20; index += 1) {
    const label = (await nextLabel.textContent())?.trim();
    if (label === 'Finish') {
      return;
    }

    await nextButton.click();
  }

  throw new Error('Site tour never reached the finish step.');
}

test('site tour feature flag hides the trigger and bootstrap when disabled', async ({ page }) => {
  test.skip(isSiteTourEnabled, 'This assertion only applies when the site tour feature is disabled.');

  await page.goto(SITE_TOUR_TEST_PAGE);

  await expect(page.locator('[data-tour-trigger]')).toHaveCount(0);
  await expect(page.locator('.aspire-site-tour-layer')).toHaveCount(0);
  await expect.poll(() => readSiteTourState(page)).toBeNull();
});

test('site tour opens from the help trigger, resumes progress, and completes on larger screens', async ({
  page,
}) => {
  test.slow();
  test.skip(!isSiteTourEnabled, 'Site tour is disabled by feature flag.');
  test.skip(isNarrowViewport(page), 'Site tour is disabled on narrow viewports.');

  await page.goto(SITE_TOUR_TEST_PAGE);

  const layer = page.locator('.aspire-site-tour-layer');
  const card = page.locator('.aspire-site-tour-card');
  const title = page.locator('#aspire-site-tour-title');
  const dismissButton = page.locator('[data-tour-action="dismiss"]');
  const nextButton = page.locator('[data-tour-action="next"]');
  const nextLabel = nextButton.locator('.aspire-site-tour-btn-label');
  const trigger = page.locator('[data-tour-trigger]').first();

  await expect(layer).toBeHidden();
  await expect.poll(() => readSiteTourState(page)).toBeNull();
  await expect(trigger).toHaveAttribute('data-tour-state', 'new');
  await trigger.dispatchEvent('click');

  await expect(card).toBeVisible();
  await expect(nextLabel).toHaveText('Next');

  await expect.poll(async () => (await readSiteTourState(page))?.started ?? null).toBe(true);
  await expect.poll(async () => (await readSiteTourState(page))?.currentStepId ?? null).not.toBe(
    null
  );
  const initialStepId = (await readSiteTourState(page))?.currentStepId ?? '';
  const initialTitle = (await title.textContent())?.trim() ?? '';

  expect(initialTitle.length).toBeGreaterThan(0);
  expect(initialStepId.length).toBeGreaterThan(0);

  await nextButton.click();

  await expect.poll(async () => (await readSiteTourState(page))?.currentStepId ?? null).not.toBe(
    initialStepId
  );
  const resumedStepId = (await readSiteTourState(page))?.currentStepId ?? '';
  const resumedTitle = (await title.textContent())?.trim() ?? '';

  expect(resumedStepId.length).toBeGreaterThan(0);
  expect(resumedTitle.length).toBeGreaterThan(0);
  expect(resumedTitle).not.toBe(initialTitle);

  await dismissButton.click();
  await expect(layer).toBeHidden();

  await rejectCookieConsentIfVisible(page);

  await expect(trigger).toHaveAttribute('data-tour-state', /(new|resume)/);
  await trigger.dispatchEvent('click');

  await expect(card).toBeVisible();
  await expect.poll(async () => (await readSiteTourState(page))?.currentStepId ?? null).toBe(
    resumedStepId
  );
  await expect(title).toHaveText(resumedTitle);

  await advanceUntilFinish(page);
  await expect(nextLabel).toHaveText('Finish');

  await nextButton.click();

  await expect(layer).toBeHidden();
  await expect.poll(async () => (await readSiteTourState(page))?.completed ?? null).toBe(true);
  await expect.poll(async () => (await readSiteTourState(page))?.hasCompletedOnce ?? null).toBe(
    true
  );
  await expect.poll(async () => (await readSiteTourState(page))?.currentStepId ?? null).toBe(
    'sidebar-toggle'
  );
  await expect(trigger).toHaveAttribute('data-tour-state', /(new|start)/);
});

test('site tour stays disabled on narrow viewports', async ({ page }) => {
  test.skip(!isSiteTourEnabled, 'Site tour is disabled by feature flag.');
  test.skip(!isNarrowViewport(page), 'This assertion only applies to narrow viewports.');

  await page.goto(SITE_TOUR_TEST_PAGE);

  const layer = page.locator('.aspire-site-tour-layer');
  const trigger = page.locator('[data-tour-trigger]').first();
  await expect(layer).toBeHidden();

  const triggerState = await trigger.evaluate((element) => {
    const button = element as HTMLButtonElement;
    return {
      disabled: button.disabled,
      ariaHidden: button.getAttribute('aria-hidden'),
      title: button.getAttribute('title'),
      ariaLabel: button.getAttribute('aria-label'),
    };
  });

  expect(triggerState).toEqual({
    disabled: true,
    ariaHidden: 'true',
    title: 'Site tour is available on larger screens',
    ariaLabel: 'Site tour is available on larger screens',
  });
  await expect.poll(() => readSiteTourState(page)).toBeNull();
});