import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test('prerequisites pivot selection updates the apphost query string and visible content', async ({
  page,
}) => {
  await page.goto('/get-started/prerequisites/');
  await dismissCookieConsentIfVisible(page);

  const pivotSelector = page.locator('#pivot-selector-apphost');
  const csharpButton = pivotSelector.getByRole('button', { name: 'C#' });
  const typeScriptButton = pivotSelector.getByRole('button', { name: 'TypeScript' });
  const csharpContent = page.getByText('The .NET 10.0 SDK is required for C# AppHosts', {
    exact: false,
  });
  const typeScriptContent = page.getByRole('link', { name: 'Node.js installation instructions' });

  await expect(csharpButton).toHaveClass(/active/);
  await expect(csharpContent).toBeVisible();

  await typeScriptButton.click();

  await expect(page).toHaveURL(/\?apphost=typescript$/);
  await expect(typeScriptButton).toHaveClass(/active/);
  await expect(csharpButton).not.toHaveClass(/active/);
  await expect(typeScriptContent).toBeVisible();
  await expect(csharpContent).toBeHidden();
});

test('app host page restores pivot state from the lang query string', async ({ page }) => {
  await page.goto('/get-started/app-host/?lang=nodejs');
  await dismissCookieConsentIfVisible(page);

  const pivotSelector = page.locator('#pivot-selector-lang');
  const nodeJsButton = pivotSelector.getByRole('button', { name: 'Node.js' });
  const javaButton = pivotSelector.getByRole('button', { name: 'Java' });
  const nodeJsContent = page.getByText(
    'This architecture demonstrates a Node.js API connecting to a PostgreSQL database',
    {
      exact: false,
    }
  );
  const csharpContent = page.getByText(
    'This architecture demonstrates a .NET API connecting to a PostgreSQL database',
    {
      exact: false,
    }
  );
  const javaContent = page.getByText(
    'This architecture demonstrates a Java API (using Spring Boot) connecting to a PostgreSQL database',
    {
      exact: false,
    }
  );

  await expect(page).toHaveURL(/\?lang=nodejs$/);
  await expect(nodeJsButton).toHaveClass(/active/);
  await expect(nodeJsContent).toBeVisible();
  await expect(csharpContent).toBeHidden();

  await javaButton.click();

  await expect(page).toHaveURL(/\?lang=java$/);
  await expect(javaButton).toHaveClass(/active/);
  await expect(nodeJsButton).not.toHaveClass(/active/);
  await expect(javaContent).toBeVisible();
  await expect(nodeJsContent).toBeHidden();
});
