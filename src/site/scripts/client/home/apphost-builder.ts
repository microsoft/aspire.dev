// Ported from src/frontend/src/components/AppHostBuilder.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
import { initializeAppHostBuilders } from './apphost-builder.client';

export function initAppHostBuilder(): void {
  const initialize = () => initializeAppHostBuilders();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}
