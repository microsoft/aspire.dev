// Homepage and 404 scripts (M3 of docs/douze-migration-plan.md), ported from the bundled <script> tags of
// src/frontend/src/components/home/*.astro, DashboardCarousel.astro, AppHostBuilder.astro and ThemeImage.astro.
// site.ts calls initHome() once per page load; every init function returns early when its root element is absent.
import { initAppHostBuilder } from './apphost-builder';
import { initDashboardCarousel } from './dashboard-carousel';
import { initHomeAgentBadges } from './home-agent-badge';
import { initHomeEnvironment } from './home-environment';
import { initHomeHero } from './home-hero';
import { initHomeIntegrationRail } from './home-integration-rail';
import { initHomePage } from './home-page';
import { initThemeImages } from './theme-images';

export function initHome(): void {
  initThemeImages();
  initHomeHero();
  initAppHostBuilder();
  initHomeAgentBadges();
  initHomePage();
  initHomeEnvironment();
  initHomeIntegrationRail();
  initDashboardCarousel();
}
