import { expect, test } from '@playwright/test';

/**
 * WebMCP integration: when the runtime exposes
 * `navigator.modelContext.registerTool`, the homepage script must call it
 * exactly once with the `search-aspire-docs` tool.
 *
 * Browsers don't ship `navigator.modelContext` yet, so we install a stub via
 * `addInitScript` before navigating and assert against the stub.
 */
test.describe('WebMCP', () => {
  test('homepage registers the search-aspire-docs tool', async ({ page }) => {
    await page.addInitScript(() => {
      type RegisteredTool = {
        name: string;
        description: string;
        inputSchema: unknown;
      };

      const calls: RegisteredTool[] = [];
      Object.defineProperty(navigator, 'modelContext', {
        configurable: true,
        value: {
          registerTool(tool: RegisteredTool): void {
            calls.push({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            });
          },
        },
      });
      (window as unknown as { __webmcpCalls: RegisteredTool[] }).__webmcpCalls = calls;
    });

    await page.goto('/');
    // Allow the deferred WebMCP module script to run; it registers
    // synchronously after import.
    await page.waitForLoadState('domcontentloaded');

    const calls = await page.evaluate(
      () => (window as unknown as { __webmcpCalls?: unknown[] }).__webmcpCalls ?? []
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: 'search-aspire-docs',
    });

    const inputSchema = (calls[0] as { inputSchema: Record<string, unknown> }).inputSchema;
    expect(inputSchema.type).toBe('object');
    const properties = inputSchema.properties as Record<string, unknown>;
    expect(properties.query).toBeDefined();
    expect((inputSchema.required as string[])).toContain('query');
  });

  test('absence of navigator.modelContext is non-fatal', async ({ page }) => {
    // Default browser env: no modelContext. Just confirm the script load
    // does not throw and the page renders.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    expect(errors).toEqual([]);
  });
});
