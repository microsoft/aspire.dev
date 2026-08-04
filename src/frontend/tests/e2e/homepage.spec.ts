import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { dismissCookieConsentIfVisible } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);
});

test('renders a complete semantic landing page without horizontal overflow', async ({ page }) => {
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Model distributed apps in code.' })
  ).toBeVisible();
  await expect(
    page.getByText(
      'Aspire is an agent-ready, code-first tool for composing, debugging, and deploying distributed applications.'
    )
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'The AppHost defines how your resources connect.',
    })
  ).toBeVisible();
  await expect(page.locator('.home-hero-product .container > .header > p')).toHaveCount(0);
  await expect(page.locator('.home-hero-story, .aspire-home > .home-section')).toHaveCount(9);
  await expect(page.locator('.language-list .language-icon')).toHaveCount(8);
  await expect(page.locator('img.cache-icon')).toHaveCount(3);
  await expect(page.locator('.testimonial-ledger .testimonial')).toHaveCount(7);
  await expect(page.locator('.home-hero-product .container > .header')).toHaveCSS(
    'border-top-right-radius',
    '0px'
  );
  await expect(page.locator('[data-dashboard-carousel]')).toHaveAttribute('data-autoplay', 'true');
  await expect(page.locator('[data-dashboard-carousel]')).toHaveAttribute(
    'data-presentation',
    'stage'
  );

  const layout = await page.evaluate(() => {
    const footer = document.querySelector<HTMLElement>('.footer-wrapper');
    const product = document.querySelector<HTMLElement>('.home-hero-product');
    const modelWindow = document.querySelector<HTMLElement>('.model-window');
    const modelStage = document.querySelector<HTMLElement>('.model-story-stage');
    const modelHeading = document.querySelector<HTMLElement>('.split-heading h2');
    const modelSummary = document.querySelector<HTMLElement>('.split-heading > div > p');
    const footerRect = footer?.getBoundingClientRect();
    const productRect = product?.getBoundingClientRect();
    const modelWindowRect = modelWindow?.getBoundingClientRect();
    const modelStageRect = modelStage?.getBoundingClientRect();
    const modelHeadingRect = modelHeading?.getBoundingClientRect();
    const modelSummaryRect = modelSummary?.getBoundingClientRect();

    return {
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      footerFits:
        footerRect !== undefined &&
        footerRect.left >= 0 &&
        footerRect.right <= window.innerWidth &&
        footerRect.width <= 1080,
      desktopProductEntersViewport:
        window.innerWidth < 1152 ||
        (productRect !== undefined && productRect.top < window.innerHeight),
      modelProofDepthStack:
        modelWindowRect !== undefined &&
        modelStageRect !== undefined &&
        modelWindow?.offsetWidth === modelStage?.offsetWidth &&
        Math.abs(
          (modelStageRect.left + modelStageRect.right) / 2 -
            (modelWindowRect.left + modelWindowRect.right) / 2
        ) <= 1 &&
        modelStageRect.width / modelWindowRect.width >= 0.89 &&
        modelStageRect.width / modelWindowRect.width <= 0.93 &&
        modelStageRect.top - modelWindowRect.bottom >= 24 &&
        modelStageRect.top - modelWindowRect.bottom <= 48,
      modelHeadingHasSpacing:
        modelHeadingRect !== undefined &&
        modelSummaryRect !== undefined &&
        modelSummaryRect.top - modelHeadingRect.bottom >= 20,
    };
  });

  expect(layout).toEqual({
    hasHorizontalOverflow: false,
    footerFits: true,
    desktopProductEntersViewport: true,
    modelProofDepthStack: true,
    modelHeadingHasSpacing: true,
  });

  const cacheIcons = page.locator('img.cache-icon');
  const cacheIconSources = await cacheIcons.evaluateAll((icons) =>
    icons.map((icon) => icon.getAttribute('src'))
  );
  expect(cacheIconSources.every((source) => source?.includes('redis-icon.'))).toBe(true);

  const visibleCacheIcon = page.locator('.model-graph img.cache-icon');
  await visibleCacheIcon.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      visibleCacheIcon.evaluate(
        (icon) => icon instanceof HTMLImageElement && icon.complete && icon.naturalWidth > 0
      )
    )
    .toBe(true);
});

test('serves every internal homepage link successfully', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');

  const internalPaths = await page.locator('a[href]').evaluateAll((links) =>
    Array.from(
      new Set(
        links.flatMap((link) => {
          const href = link.getAttribute('href');

          if (!href) {
            return [];
          }

          const url = new URL(href, document.baseURI);
          return url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol)
            ? [url.pathname]
            : [];
        })
      )
    ).sort()
  );
  const failedLinks: Array<{ path: string; status: number }> = [];

  for (const path of internalPaths) {
    const response = await request.get(path);

    if (!response.ok()) {
      failedLinks.push({ path, status: response.status() });
    }
  }

  expect(failedLinks, 'Internal homepage links should return successful responses.').toEqual([]);
});

test('presents the application model as a live polyglot topology', async ({ page }) => {
  const story = page.locator('[data-model-story]');
  const terminalWindow = story.locator('.model-window');
  const topologyStage = story.locator('[data-model-stage-label="topology"]');
  const graph = page.locator('[data-model-graph]');
  const storySummary = page.locator('.model-story-summary');
  const cards = graph.locator('.graph-resource-card');
  const frontendIcons = graph.locator('.resource-frontend .graph-resource-icon');
  const apiIcons = graph.locator('.resource-api .graph-resource-icon');
  const databaseIcons = graph.locator('.resource-database .graph-resource-icon');
  const cacheIcons = graph.locator('.resource-cache .graph-resource-icon');

  await expect(page.locator('.model-story-stage')).toHaveAttribute('aria-hidden', 'true');
  await expect(storySummary).toContainText(
    'Running aspire run turns the AppHost application model into a live resource topology'
  );
  await expect(cards).toHaveCount(4);
  await expect(cards.locator('.graph-node-name')).toHaveText([
    'frontend',
    'catalogservice',
    'postgres',
    'basketcache',
  ]);
  await expect(cards.locator('.graph-node-type')).toHaveText([
    'Frontend',
    'Service',
    'Database',
    'Cache',
  ]);
  await expect(frontendIcons).toHaveCount(3);
  await expect(apiIcons).toHaveCount(4);
  await expect(databaseIcons).toHaveCount(4);
  await expect(cacheIcons).toHaveCount(3);
  await expect(graph.locator('.graph-apphost')).toHaveCount(0);
  await terminalWindow.scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute('data-story-playing', 'true', { timeout: 10_000 });
  await expect(story).toHaveAttribute('data-story-focus', 'stage', { timeout: 10_000 });
  await topologyStage.click();
  await expect(story).toHaveAttribute('data-story-playing', 'false');
  await expect(story).toHaveAttribute('data-story-stage', 'topology');
  await expect(graph).toHaveAttribute('data-graph-active', '');
  await expect
    .poll(() =>
      graph
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
          )
        )
    )
    .toBe(true);

  const topology = await graph.evaluate((element) => {
    const images = Array.from(element.querySelectorAll<HTMLImageElement>('img'));
    const cards = Array.from(element.querySelectorAll<HTMLElement>('.graph-resource-card'));
    const resources = Array.from(element.querySelectorAll<HTMLElement>('.graph-resource'));

    return {
      imagesLoaded: images.every((image) => image.complete && image.naturalWidth > 0),
      iconSources: images.map((image) => image.currentSrc || image.src),
      minimumIconSize: Math.min(
        ...Array.from(element.querySelectorAll<HTMLElement>('.graph-resource-icon')).map(
          (icon) => icon.getBoundingClientRect().width
        )
      ),
      cardAnimations: cards.map((card) => getComputedStyle(card).animationName),
      flowAnimations: Array.from(element.querySelectorAll<SVGPathElement>('.graph-flow-line')).map(
        (line) => getComputedStyle(line).animationName
      ),
      cycleDurations: resources.map((resource) =>
        getComputedStyle(resource).getPropertyValue('--graph-cycle-duration').trim()
      ),
      cycleAnimations: Array.from(
        element.querySelectorAll<HTMLElement>('.graph-resource-icon-cycle .graph-resource-icon')
      ).map((icon) => getComputedStyle(icon).animationName),
    };
  });

  expect(topology.imagesLoaded).toBe(true);
  expect(topology.minimumIconSize).toBeGreaterThanOrEqual(19);
  expect(topology.iconSources.some((source) => source.includes('react-icon'))).toBe(true);
  expect(topology.iconSources.some((source) => source.includes('csharp'))).toBe(true);
  expect(topology.iconSources.some((source) => source.includes('postgresql-icon'))).toBe(true);
  expect(topology.iconSources.some((source) => source.includes('mongodb-icon'))).toBe(true);
  expect(topology.iconSources.some((source) => source.includes('redis-icon'))).toBe(true);
  expect(topology.iconSources.some((source) => source.includes('valkey-icon'))).toBe(true);
  expect(topology.cardAnimations.every((name) => name === 'graph-resource-idle')).toBe(true);
  expect(topology.flowAnimations).toEqual(['graph-dash', 'graph-dash', 'graph-dash']);
  expect(new Set(topology.cycleDurations).size).toBe(4);
  expect(
    topology.cycleAnimations.every(
      (name) => name === 'graph-icon-cycle-three' || name === 'graph-icon-cycle-four'
    )
  ).toBe(true);
});

test('starts finite motion after complete presentation and rail motion on entry', async ({
  page,
}) => {
  const agent = page.locator('[data-home-agent-context]');
  const agentStage = agent.locator('.agent-network');
  const story = page.locator('[data-model-story]');
  const storyStage = story.locator('.model-window');
  const environment = page.locator('[data-home-environments]');
  const environmentStage = environment.locator('.environment-stage');
  const dashboard = page.locator('[data-dashboard-carousel]');
  const dashboardStage = dashboard.locator('[data-stage]');
  const dashboardProgress = dashboard.locator('[data-progress-fill]');
  const rail = page.locator('[data-home-integration-rail]');

  const maximizeVisibility = async (target: typeof story) => {
    await target.evaluate((element) => {
      const header = document.querySelector<HTMLElement>('header.header');
      const headerBounds = header?.getBoundingClientRect();
      const viewportTop =
        headerBounds && headerBounds.top <= 0 && headerBounds.bottom > 0
          ? Math.min(headerBounds.bottom, window.innerHeight)
          : 0;
      const bounds = element.getBoundingClientRect();
      const documentTop = bounds.top + window.scrollY;
      const availableHeight = window.innerHeight - viewportTop;
      const desiredTop =
        bounds.height <= availableHeight
          ? viewportTop + Math.max(0, (availableHeight - bounds.height) / 2)
          : viewportTop;
      window.scrollTo(0, Math.max(0, documentTop - desiredTop));
    });
  };
  const visibilityShortfall = (target: typeof story) =>
    target.evaluate((element) => {
      const header = document.querySelector<HTMLElement>('header.header');
      const headerBounds = header?.getBoundingClientRect();
      const viewportTop =
        headerBounds && headerBounds.top <= 0 && headerBounds.bottom > 0
          ? Math.min(headerBounds.bottom, window.innerHeight)
          : 0;
      const bounds = element.getBoundingClientRect();
      const visibleHeight = Math.max(
        0,
        Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, viewportTop)
      );
      return Math.min(bounds.height, window.innerHeight - viewportTop) - visibleHeight;
    });

  await expect(agent).not.toHaveAttribute('data-agent-motion-active', '');
  await expect(story).toHaveAttribute('data-story-playing', 'false');
  await expect(story).not.toHaveAttribute('data-story-viewport-active', '');
  await expect(environment).not.toHaveAttribute('data-environment-motion-active', '');
  await expect(dashboard).not.toHaveAttribute('data-viewport-active', '');
  await expect(rail).not.toHaveAttribute('data-rail-motion-active', '');
  await expect(story.locator('[data-terminal-command]')).toHaveText('');
  await expect
    .poll(() => dashboardProgress.evaluate((element) => element.style.transform))
    .toBe('scaleX(0)');
  await page.waitForTimeout(500);
  await expect(story.locator('[data-terminal-command]')).toHaveText('');
  await expect(dashboard.locator('[data-slide][data-index="0"]')).not.toHaveAttribute(
    'aria-hidden',
    'true'
  );

  await maximizeVisibility(agentStage);
  await expect(agent).toHaveAttribute('data-agent-motion-active', '');
  expect(await visibilityShortfall(agentStage)).toBeLessThanOrEqual(3);

  await storyStage.evaluate((element) => {
    const documentTop = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, documentTop - window.innerHeight + 80));
  });
  await page.waitForTimeout(350);
  await expect(story).toHaveAttribute('data-story-playing', 'false');
  await expect(story.locator('[data-terminal-command]')).toHaveText('');

  await maximizeVisibility(storyStage);
  await expect(story).toHaveAttribute('data-story-viewport-active', '');
  await expect(story).toHaveAttribute('data-story-playing', 'true');
  expect(await visibilityShortfall(storyStage)).toBeLessThanOrEqual(3);

  await maximizeVisibility(environmentStage);
  await expect(environment).toHaveAttribute('data-environment-motion-active', '');
  expect(await visibilityShortfall(environmentStage)).toBeLessThanOrEqual(3);

  await maximizeVisibility(dashboardStage);
  expect(await visibilityShortfall(dashboardStage)).toBeLessThanOrEqual(3);
  await expect(dashboard).toHaveAttribute('data-viewport-active', '');

  await rail.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const documentTop = bounds.top + window.scrollY;
    window.scrollTo(0, Math.max(0, documentTop - window.innerHeight + 64));
  });
  await expect(rail).toHaveAttribute('data-rail-motion-active', '');
  expect(await visibilityShortfall(rail)).toBeGreaterThan(3);
  expect(
    await rail
      .locator('.rail-track')
      .evaluateAll((tracks) => tracks.map((track) => getComputedStyle(track).animationPlayState))
  ).toEqual(['running', 'running', 'running']);
});

test('fails safe when a finite motion stage settles nearly fully in view', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');

  const agent = page.locator('[data-home-agent-context]');
  const stage = agent.locator('.agent-network');

  await stage.evaluate((element) => {
    const header = document.querySelector<HTMLElement>('header.header');
    const headerBounds = header?.getBoundingClientRect();
    const viewportTop =
      headerBounds && headerBounds.top <= 0 && headerBounds.bottom > 0
        ? Math.min(headerBounds.bottom, window.innerHeight)
        : 0;
    const bounds = element.getBoundingClientRect();
    const documentTop = bounds.top + window.scrollY;
    const visibleHeight = Math.min(bounds.height, window.innerHeight - viewportTop) * 0.92;
    window.scrollTo(0, Math.max(0, documentTop - window.innerHeight + visibleHeight));
  });

  await page.waitForTimeout(350);
  await expect(agent).not.toHaveAttribute('data-agent-motion-active', '');
  await expect(agent).toHaveAttribute('data-agent-motion-active', '', { timeout: 2500 });
});

test('pauses and resumes the runtime story without restarting it', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 1152 || viewport.height < 768,
    'Runtime pause and resume is exercised where the complete control can remain in view.'
  );
  const story = page.locator('[data-model-story]');
  const control = story.locator('[data-model-story-toggle]');
  const focusBorders = story.locator('[data-model-focus-border]');
  const hasAnimatedFocusBorder = () =>
    focusBorders.evaluateAll((borders) =>
      borders.some(
        (border) =>
          getComputedStyle(border, '::before').animationName === 'model-focus-border-trace'
      )
    );
  const readState = () =>
    story.evaluate((element) =>
      JSON.stringify({
        stage: element.dataset.storyStage,
        command: element.querySelector('[data-terminal-command]')?.textContent,
        outputCount: Array.from(element.querySelectorAll('[data-terminal-output]')).filter((line) =>
          line.classList.contains('is-visible')
        ).length,
      })
    );

  await control.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    window.scrollBy(0, bounds.top + bounds.height / 2 - window.innerHeight / 2);
  });
  await expect.poll(() => story.getAttribute('data-story-playing')).toBe('true');
  await expect(control).toBeVisible();
  await expect(control).toHaveAccessibleName('Pause runtime story');
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  await expect(control.locator('svg:visible')).toHaveCount(1);
  await expect.poll(hasAnimatedFocusBorder).toBe(true);
  const controlPlacement = await control.evaluate((element) => {
    const terminal = element.closest<HTMLElement>('.model-terminal');
    const terminalWindow = terminal?.querySelector<HTMLElement>('.model-window');
    const controlBounds = element.getBoundingClientRect();
    const terminalBounds = terminalWindow?.getBoundingClientRect();

    return {
      directTerminalChild: element.parentElement?.classList.contains('model-terminal') ?? false,
      rightGap: terminalBounds ? terminalBounds.right - controlBounds.right : null,
      bottomGap: terminalBounds ? terminalBounds.bottom - controlBounds.bottom : null,
      radius: getComputedStyle(element).borderRadius,
    };
  });
  expect(controlPlacement.directTerminalChild).toBe(true);
  expect(controlPlacement.rightGap).toBeGreaterThanOrEqual(10);
  expect(controlPlacement.rightGap).toBeLessThanOrEqual(14);
  expect(controlPlacement.bottomGap).toBeGreaterThanOrEqual(10);
  expect(controlPlacement.bottomGap).toBeLessThanOrEqual(14);
  expect(controlPlacement.radius).toBe('10px');
  await page.waitForTimeout(650);

  await control.click();
  await expect(story).toHaveAttribute('data-story-playing', 'false');
  await expect(control).toHaveAccessibleName('Play runtime story');
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await expect(control.locator('svg:visible')).toHaveCount(1);
  await expect.poll(hasAnimatedFocusBorder).toBe(false);
  const pausedState = await readState();

  await page.waitForTimeout(900);
  expect(await readState()).toBe(pausedState);

  await control.click();
  await expect(story).toHaveAttribute('data-story-playing', 'true');
  await expect(control).toHaveAccessibleName('Pause runtime story');
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  await expect(control.locator('svg:visible')).toHaveCount(1);
  await expect.poll(hasAnimatedFocusBorder).toBe(true);
  await expect.poll(readState).not.toBe(pausedState);
});

test('matches foreground Aspire CLI output and replaces startup statuses in place', async ({
  page,
}) => {
  const story = page.locator('[data-model-story]');
  const control = story.locator('[data-model-story-toggle]');
  const status = story.locator('[data-terminal-status]');
  const appHostFile = story.locator('[data-terminal-apphost]');
  const terminalWindow = story.locator('.model-window');
  const stageSurface = story.locator('[data-model-story-surface]');
  const terminalFocusBorder = terminalWindow.locator('[data-model-focus-border]');
  const stageFocusBorder = stageSurface.locator(':scope > [data-model-focus-border]');
  const graph = story.locator('[data-model-graph]');
  const codeStage = story.locator('[data-model-stage-label="code"]');
  const topologyStage = story.locator('[data-model-stage-label="topology"]');
  const dashboardStage = story.locator('[data-model-stage-label="dashboard"]');
  const csharpButton = page.locator('.home-hero-product .lang-toggle[data-lang="csharp"]');
  const typescriptButton = page.locator('.home-hero-product .lang-toggle[data-lang="typescript"]');
  const readFocusBorderAnimations = async () => ({
    terminal: await terminalFocusBorder.evaluate(
      (element) => getComputedStyle(element, '::before').animationName
    ),
    stage: await stageFocusBorder.evaluate(
      (element) => getComputedStyle(element, '::before').animationName
    ),
  });
  const readLayerState = () =>
    story.evaluate((element) => {
      const terminal = element.querySelector<HTMLElement>('.model-terminal');
      const terminalWindow = element.querySelector<HTMLElement>('.model-window');
      const stage = element.querySelector<HTMLElement>('[data-model-story-surface]');
      if (!terminal || !terminalWindow || !stage) return null;

      const terminalStyle = getComputedStyle(terminal);
      const terminalWindowStyle = getComputedStyle(terminalWindow);
      const stageStyle = getComputedStyle(stage);
      const terminalRect = terminal.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      return {
        terminalZ: Number(terminalStyle.zIndex),
        stageZ: Number(stageStyle.zIndex),
        terminalOpacity: Number(terminalWindowStyle.opacity),
        stageOpacity: Number(stageStyle.opacity),
        terminalScale: Number(terminalStyle.scale),
        stageScale: Number(stageStyle.scale),
        terminalTransition: terminalStyle.transitionProperty,
        terminalWindowTransition: terminalWindowStyle.transitionProperty,
        stageTransition: stageStyle.transitionProperty,
        centerOffsetX:
          (stageRect.left + stageRect.right) / 2 - (terminalRect.left + terminalRect.right) / 2,
        visualGap: stageRect.top - terminalRect.bottom,
        widthRatio: stageRect.width / terminalRect.width,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

  await expect(control).toHaveAttribute('data-paused', 'false');
  await control.evaluate((button: HTMLButtonElement) => button.click());
  await expect(control).toHaveAttribute('data-paused', 'true');
  await terminalWindow.scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute('data-story-viewport-active', '');
  await expect(story).toHaveAttribute('data-story-playing', 'false');
  await control.click();
  await page.waitForFunction(
    () => {
      const root = document.querySelector<HTMLElement>('[data-model-story]');
      const control = root?.querySelector<HTMLButtonElement>('[data-model-story-toggle]');
      const status = root?.querySelector<HTMLElement>('[data-terminal-status]');
      const statusText = root?.querySelector<HTMLElement>('[data-terminal-status-text]');
      if (
        root?.dataset.storyPlaying === 'true' &&
        status?.classList.contains('is-visible') &&
        statusText?.textContent === 'Preparing Aspire server...' &&
        control
      ) {
        control.click();
        return true;
      }
      return false;
    },
    undefined,
    { polling: 50, timeout: 10_000 }
  );
  await expect(story).toHaveAttribute('data-story-playing', 'false');
  await expect(status).toHaveClass(/is-visible/);
  await expect(status).toHaveText('Preparing Aspire server...');
  await expect(story).toHaveAttribute('data-story-language', 'typescript');
  await expect(story).toHaveAttribute('data-story-focus', 'terminal');
  await expect(story).toHaveAttribute('data-story-surface', 'hidden');
  await expect(stageSurface).toHaveAttribute('aria-hidden', 'true');
  await expect(stageSurface).toHaveAttribute('inert', '');
  await expect(status).toHaveClass(/is-visible/);
  await expect(story.locator('[data-terminal-command]')).toHaveText('aspire run');
  await expect(story.locator('[data-terminal-status]')).toHaveCount(1);
  await expect(story.locator('[data-terminal-summary].is-visible')).toHaveCount(0);
  await expect
    .poll(async () => {
      const layers = await readLayerState();
      return (
        layers !== null &&
        layers.terminalZ > layers.stageZ &&
        layers.terminalScale === 1 &&
        layers.stageScale >= 0.89 &&
        layers.stageScale <= 0.93 &&
        layers.stageOpacity >= 0.7 &&
        Math.abs(layers.centerOffsetX) <= 1 &&
        layers.widthRatio >= 0.89 &&
        layers.widthRatio <= 0.93 &&
        layers.visualGap >= 24 &&
        layers.visualGap <= 48 &&
        layers.terminalTransition.includes('scale') &&
        layers.terminalWindowTransition.includes('opacity') &&
        layers.stageTransition.includes('scale') &&
        layers.stageTransition.includes('opacity') &&
        !layers.horizontalOverflow
      );
    })
    .toBe(true);

  await control.click();
  await expect(story).toHaveAttribute('data-story-playing', 'true');
  await expect
    .poll(() => status.textContent(), { timeout: 5_000 })
    .toBe('Connecting to AppHost...');
  await expect(story).toHaveAttribute('data-story-focus', 'stage');
  await expect(story).toHaveAttribute('data-story-surface', 'visible');
  await expect(stageSurface).toHaveAttribute('aria-hidden', 'false');
  await expect(stageSurface).not.toHaveAttribute('inert', '');
  await expect(codeStage).toHaveAttribute('data-active', 'true');
  await expect(story).toHaveAttribute('data-story-swap', 'stage');
  await expect.poll(readFocusBorderAnimations).toEqual({
    terminal: 'none',
    stage: 'model-focus-border-trace',
  });
  await control.click();
  await expect(story).toHaveAttribute('data-story-playing', 'false');
  await expect
    .poll(async () => {
      const layers = await readLayerState();
      return (
        layers !== null &&
        layers.stageZ > layers.terminalZ &&
        layers.stageScale === 1 &&
        layers.terminalScale >= 0.89 &&
        layers.terminalScale <= 0.93 &&
        layers.stageOpacity === 1 &&
        layers.terminalOpacity < 0.8 &&
        Math.abs(layers.centerOffsetX) <= 1 &&
        layers.widthRatio >= 1.07 &&
        layers.widthRatio <= 1.11 &&
        layers.visualGap >= 24 &&
        layers.visualGap <= 48 &&
        !layers.horizontalOverflow
      );
    })
    .toBe(true);

  await control.click();
  await expect(story).toHaveAttribute('data-story-playing', 'true');
  await expect(topologyStage).toHaveAttribute('data-active', 'true');
  await expect(graph).toHaveAttribute('data-graph-active', '');
  await control.click();
  await expect(story).toHaveAttribute('data-story-playing', 'false');

  await control.click();
  await expect(story).toHaveAttribute('data-story-playing', 'true');
  await expect(story).toHaveAttribute('data-story-focus', 'terminal');
  await expect(story).toHaveAttribute('data-story-swap', 'terminal');
  await expect(story).toHaveAttribute('data-story-surface', 'visible');
  await expect(stageSurface).toHaveAttribute('aria-hidden', 'true');
  await expect(stageSurface).toHaveAttribute('inert', '');
  await expect(graph).toHaveAttribute('data-graph-active', '');
  await expect.poll(readFocusBorderAnimations).toEqual({
    terminal: 'model-focus-border-trace',
    stage: 'none',
  });
  await control.click();
  await expect(story).toHaveAttribute('data-story-playing', 'false');
  await expect
    .poll(async () => {
      const layers = await readLayerState();
      return (
        layers !== null &&
        layers.terminalZ > layers.stageZ &&
        layers.terminalScale === 1 &&
        layers.stageScale >= 0.89 &&
        layers.stageScale <= 0.93 &&
        layers.terminalOpacity === 1 &&
        layers.stageOpacity < 0.8 &&
        Math.abs(layers.centerOffsetX) <= 1 &&
        layers.widthRatio >= 0.89 &&
        layers.widthRatio <= 0.93 &&
        layers.visualGap >= 24 &&
        layers.visualGap <= 48 &&
        !layers.horizontalOverflow
      );
    })
    .toBe(true);

  await control.click();
  await expect(story).toHaveAttribute('data-story-playing', 'true');
  await expect.poll(() => status.textContent(), { timeout: 5_000 }).toBe('Starting dashboard...');
  await expect
    .poll(() => story.locator('[data-terminal-summary].is-visible').count(), { timeout: 5_000 })
    .toBe(4);
  await expect(story).toHaveAttribute('data-story-focus', 'stage');
  await expect(story).toHaveAttribute('data-story-swap', 'stage');
  await expect(dashboardStage).toHaveAttribute('data-active', 'true');
  await expect(graph).not.toHaveAttribute('data-graph-active', '');
  await expect(stageSurface).toHaveAttribute('aria-hidden', 'false');
  await expect(stageSurface).not.toHaveAttribute('inert', '');
  await expect.poll(readFocusBorderAnimations).toEqual({
    terminal: 'none',
    stage: 'model-focus-border-trace',
  });
  await control.click();
  await expect(story).toHaveAttribute('data-story-playing', 'false');

  await expect(status).not.toHaveClass(/is-visible/);
  await expect(story.locator('.term-key')).toHaveText(['AppHost:', 'Dashboard:', 'Logs:']);
  await expect(appHostFile).toHaveText('apphost.mts');
  await expect(story.locator('.term-link')).toHaveText('https://localhost:17178/login?t=b3f9c1e0');
  await expect(story.locator('.term-val').last()).toHaveText('~/.aspire/cli/logs/apphost-2f8c.log');
  await expect(story.locator('.term-hint')).toHaveText(
    'Press CTRL+C to stop the AppHost and exit.'
  );

  await csharpButton.click();
  await expect(story).toHaveAttribute('data-story-language', 'csharp');
  await expect(appHostFile).toHaveText('apphost.cs');
  await codeStage.click();
  await expect(status).toHaveText('Checking project type... apphost.cs');
  await terminalWindow.scrollIntoViewIfNeeded();
  await control.click();
  await expect.poll(() => status.textContent()).toBe('Building AppHost... apphost.cs');
  await codeStage.click();
  await expect(story).toHaveAttribute('data-story-playing', 'false');

  await typescriptButton.click();
  await expect(story).toHaveAttribute('data-story-language', 'typescript');
  await expect(status).toHaveText('Preparing Aspire server...');
  await expect(appHostFile).toHaveText('apphost.mts');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(story).toHaveAttribute('data-story-stage', 'dashboard');
  await expect(story).toHaveAttribute('data-story-focus', 'stage');
  await expect(story).toHaveAttribute('data-story-surface', 'visible');
  await expect(control).toBeDisabled();
  await expect(stageSurface).toHaveAttribute('aria-hidden', 'false');
  await expect(stageSurface).not.toHaveAttribute('inert', '');
  await expect(status).not.toHaveClass(/is-visible/);
  await expect(story.locator('[data-terminal-summary].is-visible')).toHaveCount(4);
  await expect(appHostFile).toHaveText('apphost.mts');
  await expect
    .poll(() =>
      story
        .locator('[data-model-focus-border]')
        .evaluateAll((borders) =>
          borders.map((border) => getComputedStyle(border, '::before').animationName)
        )
    )
    .toEqual(['none', 'none']);
  const [terminalBorderColor, stageBorderColor] = await Promise.all([
    terminalWindow.evaluate((element) => getComputedStyle(element).borderColor),
    stageSurface.evaluate((element) => getComputedStyle(element).borderColor),
  ]);
  expect(stageBorderColor).not.toBe(terminalBorderColor);
  await expect
    .poll(() =>
      story.locator('.term-spinner').evaluate((element) => getComputedStyle(element).animationName)
    )
    .toBe('none');
});

test('reveals editorial link underlines from left to right', async ({ page }) => {
  const links = page.locator('[data-home-link]');
  await expect(links).not.toHaveCount(0);

  const link = links.first();
  await link.scrollIntoViewIfNeeded();
  const underline = () =>
    link.evaluate((element) => {
      const style = getComputedStyle(element, '::after');
      return { height: style.height, transform: style.transform };
    });

  await expect.poll(underline).toEqual({
    height: '2px',
    transform: 'matrix(0, 0, 0, 1, 0, 0)',
  });
  await link.hover();
  await expect.poll(underline).toEqual({
    height: '2px',
    transform: 'matrix(1, 0, 0, 1, 0, 0)',
  });
});

test('places executable agent context after the polyglot section', async ({ page }) => {
  const agentSection = page.locator('[data-home-agent-context]');
  await expect(
    agentSection.getByRole('heading', {
      level: 2,
      name: 'Give AI the context to reason across your whole system.',
    })
  ).toBeVisible();

  const sectionOrder = await page
    .locator('.aspire-home > .home-section')
    .evaluateAll((sections) =>
      sections.map((section) =>
        ['home-languages', 'home-agent-context', 'home-model'].find((className) =>
          section.classList.contains(className)
        )
      )
    );
  expect(sectionOrder.slice(0, 3)).toEqual(['home-languages', 'home-agent-context', 'home-model']);

  const sectionIndices = await page.locator('.aspire-home .section-index > span').allTextContents();
  expect(sectionIndices).toEqual(['01', '02', '03', '04', '05', '06', '07', '08']);

  const agentLogos = agentSection.locator('[data-agent-logo]');
  await expect(agentLogos).toHaveCount(3);
  expect(
    new Set(await agentLogos.evaluateAll((logos) => logos.map((logo) => logo.dataset.agentLogo)))
      .size
  ).toBe(3);
  await expect(agentSection.locator('[data-agent-logo="github-copilot"] svg')).toHaveCount(1);
  await expect(agentSection.getByText('Works with any AI tool.')).toBeVisible();

  await agentSection.scrollIntoViewIfNeeded();
  const visibleLogoImages = agentSection.locator('img.agent-logo-image:visible');
  await expect(visibleLogoImages).toHaveCount(2);
  await expect
    .poll(() =>
      visibleLogoImages.evaluateAll((images) =>
        images.every(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
        )
      )
    )
    .toBe(true);
});

test('activates a two-way Aspire loop for each AI tool', async ({ page }) => {
  const section = page.locator('[data-home-agent-context]');
  const network = section.locator('[data-agent-network]');
  const routes = network.locator('[data-agent-route]');
  const githubCopilot = section.locator('[data-agent-logo="github-copilot"]');
  const claude = section.locator('[data-agent-logo="claude"]');
  const claudeRoute = network.locator('[data-agent-route="claude"]');
  const activeSentence = section.locator('[data-agent-active-sentence]');

  await section.scrollIntoViewIfNeeded();
  await expect(routes).toHaveCount(3);
  await expect(routes.locator('path[marker-start][marker-end]')).toHaveCount(3);
  await expect(network).toHaveAttribute('data-has-active', 'true');
  await expect(network).toHaveAttribute('data-active-agent', 'github-copilot');
  await expect(githubCopilot).toHaveAttribute('aria-pressed', 'true');
  await expect(activeSentence).toContainText('Aspire provides GitHub Copilot');

  await claude.hover();
  await expect(network).toHaveAttribute('data-active-agent', 'claude');
  await expect(claudeRoute).toHaveAttribute('data-active', 'true');
  await expect(activeSentence).toContainText('Aspire provides Claude');

  await page.mouse.move(0, 0);
  await expect(network).toHaveAttribute('data-active-agent', 'github-copilot');

  await claude.focus();
  await expect(network).toHaveAttribute('data-active-agent', 'claude');
  await expect(claude).toHaveAttribute('aria-pressed', 'false');

  await claude.click();
  await expect(claude).toHaveAttribute('aria-pressed', 'true');
});

test('keeps AI provider copy stable while the active sentence crossfades', async ({ page }) => {
  const section = page.locator('[data-home-agent-context]');
  const story = section.locator('.agent-story');
  const network = section.locator('[data-agent-network]');
  const heights: number[] = [];

  await section.scrollIntoViewIfNeeded();
  for (const id of ['github-copilot', 'claude', 'openai']) {
    await section.locator(`[data-agent-logo="${id}"]`).click();
    await expect(network).toHaveAttribute('data-active-agent', id);
    await expect(section.locator(`[data-agent-sentence-panel="${id}"]`)).toHaveAttribute(
      'data-active',
      'true'
    );
    await expect(section.locator(`[data-agent-sentence-panel="${id}"]`)).toHaveCSS(
      'visibility',
      'visible'
    );
    heights.push(await story.evaluate((element) => element.getBoundingClientRect().height));
  }

  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
});

test('places passive AI context tips beside the model, environment, and dashboard', async ({
  page,
}) => {
  const cases = [
    {
      selector: '.home-model [data-home-agent-badge]',
      label: 'Built for your AI agent',
      description: 'resource graph, references, configuration, and commands',
    },
    {
      selector: '[data-home-environments] [data-home-agent-badge]',
      label: 'Agents see every environment',
      description: 'resources, endpoints, health, and available commands',
    },
    {
      selector: '.home-dashboard [data-home-agent-badge]',
      label: 'Agents act on these signals',
      description: 'logs, traces, metrics, health, and resource commands',
    },
  ];

  await expect(page.locator('[data-home-agent-badge]')).toHaveCount(3);
  for (const context of cases) {
    const badge = page.locator(context.selector);
    const popover = badge.getByRole('tooltip');

    await badge.scrollIntoViewIfNeeded();
    await expect(badge).toContainText(context.label);
    await expect(badge.locator('button, details, summary')).toHaveCount(0);
    await expect(popover).toBeHidden();

    await badge.hover();
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('Context from Aspire');
    await expect(popover).toContainText(context.description);

    await page.mouse.move(0, 0);
    await expect(popover).toBeHidden();
    await badge.focus();
    await expect(popover).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(popover).toBeHidden();
  }
});

test('uses theme-aware SVGs and the standard GitHub mark for AI tools', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((nextTheme) => localStorage.setItem('starlight-theme', nextTheme), theme);
    await page.reload();
    await dismissCookieConsentIfVisible(page);
    await page.locator('[data-home-agent-context]').scrollIntoViewIfNeeded();

    const agentLogos = page.locator('[data-agent-logo-source="lobehub"]');
    await expect(agentLogos).toHaveCount(2);
    await expect(page.locator('[data-agent-logo="github-copilot"] svg')).toHaveCount(1);
    const logoStyles = await agentLogos.evaluateAll((logos) =>
      logos.map((logo) => ({
        filter: getComputedStyle(logo).filter,
        source: logo instanceof HTMLImageElement ? logo.currentSrc : '',
        treatment: logo.getAttribute('data-agent-logo-treatment'),
      }))
    );

    expect(logoStyles.every(({ source }) => source.includes('.svg'))).toBe(true);
    expect(
      logoStyles.every(
        ({ filter, treatment }) =>
          filter === (theme === 'dark' && treatment === 'monochrome' ? 'invert(1)' : 'none')
      )
    ).toBe(true);
  }
});

test('uses consistent semantic colors for primary and selected controls', async ({ page }) => {
  const readActionPalette = () =>
    page.evaluate(() => {
      const readStyle = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing action control: ${selector}`);

        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          border: style.borderColor,
          color: style.color,
        };
      };

      return {
        primary: [readStyle('header .try-aspire-btn'), readStyle('.home-hero-action.primary')],
        selected: [readStyle('.lang-toggle.active'), readStyle('.toggle.active')],
        secondary: readStyle('header .docs-btn'),
      };
    });

  for (const theme of ['light', 'dark']) {
    await page.evaluate((nextTheme) => localStorage.setItem('starlight-theme', nextTheme), theme);
    await page.reload();
    await dismissCookieConsentIfVisible(page);

    const palette = await readActionPalette();
    const primaryBackgrounds = palette.primary.map(({ background }) => background);
    const selectedBackgrounds = palette.selected.map(({ background }) => background);

    expect(new Set(primaryBackgrounds).size).toBe(1);
    expect(new Set(selectedBackgrounds).size).toBe(1);
    expect(primaryBackgrounds[0]).not.toBe(selectedBackgrounds[0]);
    expect(palette.secondary.background).not.toBe(primaryBackgrounds[0]);
    expect(palette.secondary.background).not.toBe(selectedBackgrounds[0]);
    expect(new Set(palette.primary.map(({ color }) => color)).size).toBe(1);
    expect(new Set(palette.selected.map(({ color }) => color)).size).toBe(1);
  }
});

test('keeps the dark hero artwork subdued and clear of the CTA row', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('starlight-theme', 'dark'));
  await page.reload();
  await dismissCookieConsentIfVisible(page);

  const heroTreatment = await page.evaluate(() => {
    const actions = document.querySelector<HTMLElement>('.home-hero-actions');
    const artwork = document.querySelector<HTMLElement>('.home-hero-mark');
    const artworkImage = artwork?.querySelector<HTMLElement>('img');
    const product = document.querySelector<HTMLElement>('.home-hero-product');
    if (!actions || !artwork || !artworkImage || !product) {
      throw new Error('The hero actions, artwork, or product proof did not render.');
    }

    const actionsRect = actions.getBoundingClientRect();
    const artworkRect = artwork.getBoundingClientRect();
    const productRect = product.getBoundingClientRect();
    return {
      artworkGap: artworkRect.top - actionsRect.bottom,
      artworkOpacity: Number.parseFloat(getComputedStyle(artwork).opacity),
      artworkFilter: getComputedStyle(artworkImage).filter,
      productGap: productRect.top - actionsRect.bottom,
    };
  });

  expect(heroTreatment.artworkGap).toBeGreaterThanOrEqual(0);
  expect(heroTreatment.artworkOpacity).toBeLessThan(0.7);
  expect(heroTreatment.artworkFilter).toContain('brightness(0.78)');
  expect(heroTreatment.productGap).toBeGreaterThanOrEqual(32);
});

test('reflows to 320 CSS pixels without clipping the page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.reload();
  await dismissCookieConsentIfVisible(page);

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-home-environments]')).toBeVisible();
  await expect(page.locator('[data-home-agent-badge]')).toHaveCount(3);

  const dimensions = await page.evaluate(() => {
    const heroCopy = document.querySelector<HTMLElement>('.home-hero-copy');
    const heroHeading = heroCopy?.querySelector<HTMLElement>('h1');
    const heroActions = heroCopy?.querySelector<HTMLElement>('.home-hero-actions');
    const agentNetwork = document.querySelector<HTMLElement>('.agent-network');
    const footer = document.querySelector<HTMLElement>('.footer-wrapper');
    const heroCopyRect = heroCopy?.getBoundingClientRect();
    const heroHeadingRect = heroHeading?.getBoundingClientRect();
    const heroHeadingLineHeight = heroHeading
      ? Number.parseFloat(getComputedStyle(heroHeading).lineHeight)
      : 0;
    const heroActionsRect = heroActions?.getBoundingClientRect();
    const agentNetworkRect = agentNetwork?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();

    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heroHeadingLines:
        heroHeadingRect === undefined || heroHeadingLineHeight === 0
          ? 0
          : Math.round(heroHeadingRect.height / heroHeadingLineHeight),
      heroActionsFitViewport:
        heroActionsRect !== undefined && heroActionsRect.bottom <= window.innerHeight,
      heroCopyFits:
        heroCopyRect !== undefined &&
        heroCopyRect.left >= 0 &&
        heroCopyRect.right <= window.innerWidth,
      agentNetworkFits:
        agentNetworkRect !== undefined &&
        agentNetworkRect.left >= 0 &&
        agentNetworkRect.right <= window.innerWidth,
      footerFits:
        footerRect !== undefined && footerRect.left >= 0 && footerRect.right <= window.innerWidth,
    };
  });

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.heroHeadingLines).toBeLessThanOrEqual(2);
  expect(dimensions.heroActionsFitViewport).toBe(true);
  expect(dimensions.heroCopyFits).toBe(true);
  expect(dimensions.agentNetworkFits).toBe(true);
  expect(dimensions.footerFits).toBe(true);
});

test('keeps the environment frame stable while each topology changes', async ({ page }) => {
  const environment = page.locator('[data-home-environments]');
  const stage = environment.locator('.environment-stage');
  const stateHeights: number[] = [];
  const stateAccents: string[] = [];

  await stage.scrollIntoViewIfNeeded();
  await expect(environment).toHaveAttribute('data-environment-motion-active', '');

  for (const state of ['Local', 'Test', 'Production']) {
    const button = environment.getByRole('button', { name: state });
    await button.click();

    const panel = environment.locator(`[data-environment-panel="${state.toLowerCase()}"]`);
    await expect(panel).toHaveAttribute('aria-hidden', 'false');
    await expect
      .poll(() =>
        environment
          .locator('[data-environment-panel]')
          .evaluateAll((panels) => panels.filter((panel) => !panel.hasAttribute('hidden')).length)
      )
      .toBe(1);
    const accent = await button.evaluate((element) => {
      const indicatorColor = getComputedStyle(element, '::after').backgroundColor;
      const eyebrow = element
        .closest('[data-home-environments]')
        ?.querySelector<HTMLElement>(
          '[data-environment-panel]:not([hidden]) .environment-copy > p'
        );

      return {
        indicatorColor,
        eyebrowColor: eyebrow ? getComputedStyle(eyebrow).color : null,
      };
    });

    expect(accent.indicatorColor).toBe(accent.eyebrowColor);
    stateAccents.push(accent.indicatorColor);
    stateHeights.push(await stage.evaluate((element) => element.getBoundingClientRect().height));
    await expect(panel.locator('.topology-node-copy > strong')).toHaveText([
      'frontend',
      'api',
      'database',
      'cache',
    ]);
  }

  expect(new Set(stateAccents).size).toBe(3);
  expect(stateHeights.every((height) => Math.abs(height - stateHeights[0]) <= 1)).toBe(true);

  const testButton = environment.getByRole('button', { name: 'Test' });
  await testButton.click();
  const testPanel = environment.locator('[data-environment-panel="test"]');
  await expect(testPanel.getByRole('link', { name: 'Testing docs' })).toHaveAttribute(
    'href',
    '/testing/overview/'
  );
  await expect(testPanel).not.toContainText('dotnet test');
  await expect(testPanel.locator('.topology-detail-cycle')).toContainText([
    'dev tunnel',
    'staging environment',
    'staged database',
    'short-lived container',
  ]);

  const productionButton = environment.getByRole('button', { name: 'Production' });
  await productionButton.click();
  const productionPanel = environment.locator('[data-environment-panel="production"]');
  await expect(productionPanel).toHaveAttribute('aria-hidden', 'false');
  await expect(productionPanel).not.toHaveAttribute('data-transition');
  await expect(productionPanel.locator('.topology-node-icon-cycle')).toHaveCount(4);
  await expect(productionPanel.locator('.topology-node-icon-cycle img')).toHaveCount(8);
  await expect(productionPanel.locator('img.topology-node-icon-aws')).toHaveCount(4);
  await expect
    .poll(() =>
      productionPanel
        .locator('.topology-node-icon-cycle img')
        .evaluateAll((icons) =>
          icons.every(
            (icon) => icon instanceof HTMLImageElement && icon.complete && icon.naturalWidth > 0
          )
        )
    )
    .toBe(true);
  const awsSources = await productionPanel
    .locator('img.topology-node-icon-aws')
    .evaluateAll((icons) => icons.map((icon) => icon.getAttribute('src')));
  expect(awsSources.every((source) => source?.includes('aws.'))).toBe(true);
  expect(
    await productionPanel
      .locator('.topology-node-icon-cycle img')
      .evaluateAll((icons) => icons.map((icon) => getComputedStyle(icon).animationName))
  ).toEqual(Array.from({ length: 8 }, () => 'topology-cycle-two'));
  expect(
    await productionPanel
      .locator('.topology-detail-cycle small')
      .evaluateAll((details) => details.map((detail) => getComputedStyle(detail).animationName))
  ).toEqual(Array.from({ length: 8 }, () => 'topology-detail-cycle-two'));
  expect(
    await productionPanel
      .locator('.topology-node-card')
      .evaluateAll((cards) => cards.map((card) => getComputedStyle(card).animationName))
  ).toEqual([
    'topology-node-idle',
    'topology-node-idle',
    'topology-node-idle',
    'topology-node-idle',
  ]);
  expect(
    await productionPanel
      .locator('.topology-node-card')
      .evaluateAll((cards) => cards.map((card) => getComputedStyle(card, '::before').animationName))
  ).toEqual([
    'topology-radar-out',
    'topology-radar-out',
    'topology-radar-out',
    'topology-radar-out',
  ]);
  expect(
    await productionPanel
      .locator('.topology-node-card')
      .evaluateAll((cards) => cards.map((card) => getComputedStyle(card, '::after').animationName))
  ).toEqual(['topology-radar-in', 'topology-radar-in', 'topology-radar-in', 'topology-radar-in']);
  const coreRadar = await productionPanel.locator('.topology-core').evaluate((core) => {
    const outward = getComputedStyle(core, '::before');
    const inward = getComputedStyle(core, '::after');
    return {
      outwardAnimation: outward.animationName,
      inwardAnimation: inward.animationName,
      outwardColor: outward.borderTopColor,
      inwardColor: inward.borderTopColor,
    };
  });
  expect(coreRadar.outwardAnimation).toBe('topology-core-radar-out');
  expect(coreRadar.inwardAnimation).toBe('topology-core-radar-in');
  expect(coreRadar.outwardColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(coreRadar.inwardColor).toBe(coreRadar.outwardColor);
  const stagePosition = await stage.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { top: bounds.top + window.scrollY, height: bounds.height };
  });
  await page.evaluate(
    ({ top }) => window.scrollTo(0, Math.max(0, top - window.innerHeight + 80)),
    stagePosition
  );
  await expect
    .poll(() =>
      environment.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).getPropertyValue('--environment-scroll-factor'))
      )
    )
    .toBeGreaterThan(0.5);
  const enteringTransforms = await productionPanel
    .locator('.topology-node')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).transform));

  await page.evaluate(
    ({ top, height }) =>
      window.scrollTo(0, Math.max(0, top - Math.max((window.innerHeight - height) / 2, 0))),
    stagePosition
  );
  await expect
    .poll(() =>
      environment.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).getPropertyValue('--environment-scroll-factor'))
      )
    )
    .toBeLessThan(0.1);
  const centeredTransforms = await productionPanel
    .locator('.topology-node')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).transform));
  expect(
    enteringTransforms.some((transform, index) => transform !== centeredTransforms[index])
  ).toBe(true);

  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false
  );
});

test('fades environment changes and pauses independent resource motion', async ({ page }) => {
  const environment = page.locator('[data-home-environments]');
  const stage = environment.locator('.environment-stage');
  const localPanel = environment.locator('[data-environment-panel="local"]');
  const testPanel = environment.locator('[data-environment-panel="test"]');
  const productionPanel = environment.locator('[data-environment-panel="production"]');
  const control = environment.locator('[data-environment-motion-control]');

  await stage.scrollIntoViewIfNeeded();
  await expect(environment).toHaveAttribute('data-environment-motion-active', '');
  await expect(control).toBeVisible();
  await expect(control).toHaveAccessibleName('Pause environment animation');
  await expect(control.locator('svg:visible')).toHaveCount(1);

  const placement = await control.evaluate((element) => {
    const stage = element.closest<HTMLElement>('.environment-stage');
    const stageBounds = stage?.getBoundingClientRect();
    const controlBounds = element.getBoundingClientRect();
    return {
      leftGap: stageBounds ? controlBounds.left - stageBounds.left : null,
      bottomGap: stageBounds ? stageBounds.bottom - controlBounds.bottom : null,
    };
  });
  expect(placement.leftGap).toBeGreaterThanOrEqual(14);
  expect(placement.leftGap).toBeLessThanOrEqual(18);
  expect(placement.bottomGap).toBeGreaterThanOrEqual(14);
  expect(placement.bottomGap).toBeLessThanOrEqual(18);

  await testPanel.evaluate((element) => {
    element.dataset.testFadeSeen = 'false';
    element.addEventListener(
      'animationstart',
      (event) => {
        if (event.animationName === 'environment-panel-fade-in') {
          element.dataset.testFadeSeen = 'true';
        }
      },
      { once: true }
    );
  });
  await environment.getByRole('button', { name: 'Test' }).click();
  await expect(localPanel).toBeHidden();
  await expect(testPanel).toHaveAttribute('data-test-fade-seen', 'true');
  await expect(testPanel).not.toHaveAttribute('data-transition', { timeout: 2_000 });

  await localPanel.evaluate((element) => {
    element.dataset.testFadeSeen = 'false';
    element.addEventListener(
      'animationstart',
      (event) => {
        if (event.animationName === 'environment-panel-fade-in') {
          element.dataset.testFadeSeen = 'true';
        }
      },
      { once: true }
    );
  });
  await environment.getByRole('button', { name: 'Local' }).click();
  await expect(testPanel).toBeHidden();
  await expect(localPanel).toHaveAttribute('data-test-fade-seen', 'true');
  await expect(localPanel).not.toHaveAttribute('data-transition', { timeout: 2_000 });

  await environment.getByRole('button', { name: 'Production' }).click();
  await expect(productionPanel).not.toHaveAttribute('data-transition', { timeout: 2_000 });
  const cadences = await productionPanel.locator('.topology-node').evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        duration: style.getPropertyValue('--topology-cycle-duration').trim(),
        radarDelay: style.getPropertyValue('--topology-radar-delay').trim(),
      };
    })
  );
  expect(new Set(cadences.map(({ duration }) => duration)).size).toBe(4);
  expect(new Set(cadences.map(({ radarDelay }) => radarDelay)).size).toBe(4);

  await control.click();
  await expect(environment).toHaveAttribute('data-environment-paused', '');
  await expect(control).toHaveAccessibleName('Play environment animation');
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await expect(control.locator('svg:visible')).toHaveCount(1);
  expect(
    await productionPanel
      .locator('.topology-node-card')
      .evaluateAll((cards) => cards.map((card) => getComputedStyle(card).animationPlayState))
  ).toEqual(['paused', 'paused', 'paused', 'paused']);

  await control.click();
  await expect(environment).not.toHaveAttribute('data-environment-paused');
  await expect(control).toHaveAccessibleName('Pause environment animation');
  expect(
    await productionPanel
      .locator('.topology-node-card')
      .evaluateAll((cards) => cards.map((card) => getComputedStyle(card).animationPlayState))
  ).toEqual(['running', 'running', 'running', 'running']);
});

test('passes WCAG AA checks in every environment state', async ({ page }) => {
  const environment = page.locator('[data-home-environments]');
  await environment.scrollIntoViewIfNeeded();

  for (const state of ['Local', 'Test', 'Production']) {
    await environment.getByRole('button', { name: state }).click();

    const results = await new AxeBuilder({ page })
      .include('[data-home-environments]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const violations = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    }));

    expect(
      violations,
      violations.length === 0 ? undefined : `${state}: ${JSON.stringify(violations, null, 2)}`
    ).toEqual([]);
  }
});

test('reflows testimonials without a horizontal mobile scroller', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await dismissCookieConsentIfVisible(page);

  const ledger = page.locator('.testimonial-ledger');
  await ledger.scrollIntoViewIfNeeded();
  const layout = await ledger.evaluate((element) => {
    const cards = Array.from(element.querySelectorAll<HTMLElement>('.testimonial'));
    const columns = new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left)));

    return {
      cards: cards.length,
      columns: columns.size,
      display: getComputedStyle(element).display,
      overflowX: getComputedStyle(element).overflowX,
      scrolls: element.scrollWidth > element.clientWidth,
      tabindex: element.getAttribute('tabindex'),
    };
  });

  expect(layout).toEqual({
    cards: 7,
    columns: 1,
    display: 'grid',
    overflowX: 'visible',
    scrolls: false,
    tabindex: null,
  });
});

test('provides an explicit integrations motion control and non-tabbable duplicate content', async ({
  page,
}) => {
  const rail = page.locator('[data-home-integration-rail]');
  const control = rail.locator('[data-rail-control]');
  const duplicate = rail.locator('.rail-group[aria-hidden="true"]');
  const tracks = rail.locator('.rail-track');
  const isMobile = (page.viewportSize()?.width ?? 0) < 800;

  await expect(rail.locator('.rail-viewport')).toHaveCount(3);
  await expect(duplicate).toHaveCount(3);
  const laneNames = await rail
    .locator('.rail-group:not([aria-hidden])')
    .evaluateAll((groups) =>
      groups.map((group) =>
        Array.from(group.querySelectorAll<HTMLElement>('[data-integration-name]')).map(
          (item) => item.dataset.integrationName
        )
      )
    );
  expect(laneNames.every((names) => names.length === 12)).toBe(true);
  expect(new Set(laneNames.flat()).size).toBe(36);
  await expect(duplicate.locator('a[tabindex="-1"]')).toHaveCount(36);
  await expect(rail.locator('.integration-logo[title]')).toHaveCount(0);

  if (isMobile) {
    await rail.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
    await expect(control).toHaveAccessibleName('Pause integration animation');
    await expect(control).toHaveAttribute('aria-pressed', 'false');
    await expect(rail.locator('.rail-lanes')).toBeVisible();
    expect(
      await tracks.evaluateAll((items) => items.map((item) => getComputedStyle(item).animationName))
    ).toEqual(['integration-scroll-left', 'integration-scroll-right', 'integration-scroll-left']);

    const firstLane = rail.locator('.rail-viewport').first();
    const laneMetrics = await firstLane.evaluate((element) => {
      const group = element.querySelector<HTMLElement>('.rail-group');
      const style = getComputedStyle(element);
      return {
        edgeFade: style.maskImage,
        overflowX: style.overflowX,
        scrollLeft: element.scrollLeft,
        scrollLimit: Math.max(0, (group?.scrollWidth ?? 0) - element.clientWidth),
        touchAction: style.touchAction,
      };
    });
    expect(laneMetrics.overflowX).toBe('auto');
    expect(laneMetrics.edgeFade).toContain('linear-gradient');
    expect(laneMetrics.touchAction).toContain('pan-x');
    expect(laneMetrics.scrollLimit).toBeGreaterThan(0);
    expect(laneMetrics.scrollLeft).toBeGreaterThan(0);

    await firstLane.evaluate((element) => element.scrollBy({ left: 80 }));
    await expect
      .poll(() => firstLane.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(laneMetrics.scrollLeft);

    await firstLane.dispatchEvent('pointerdown', {
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    });
    await expect(firstLane).toHaveAttribute('data-rail-interacting', '');
    await expect
      .poll(() =>
        firstLane
          .locator('.rail-track')
          .evaluate((item) => getComputedStyle(item).animationPlayState)
      )
      .toBe('paused');
    await expect(firstLane).not.toHaveAttribute('data-rail-interacting', '', { timeout: 2_000 });
    await expect
      .poll(() =>
        firstLane
          .locator('.rail-track')
          .evaluate((item) => getComputedStyle(item).animationPlayState)
      )
      .toBe('running');

    await control.click();
    await expect(rail).toHaveClass(/paused/);
    await expect(control).toHaveAccessibleName('Play integration animation');
    expect(
      await tracks.evaluateAll((items) =>
        items.map((item) => getComputedStyle(item).animationPlayState)
      )
    ).toEqual(['paused', 'paused', 'paused']);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const reducedRail = page.locator('[data-home-integration-rail]');
    await reducedRail.scrollIntoViewIfNeeded();
    await expect(reducedRail.locator('[data-rail-control]')).toBeHidden();
    expect(
      await reducedRail
        .locator('.rail-track')
        .evaluateAll((items) => items.map((item) => getComputedStyle(item).animationName))
    ).toEqual(['none', 'none', 'none']);
    await expect(reducedRail.locator('.rail-lanes')).toBeVisible();
  } else {
    await rail.scrollIntoViewIfNeeded();
    await expect(rail).toHaveAttribute('data-rail-motion-active', '');
    await expect(control).toBeVisible();
    await expect(control).toHaveAccessibleName('Pause integration animation');
    await expect(control).toHaveAttribute('aria-pressed', 'false');
    await expect(control.locator('svg')).toHaveCount(2);
    await expect(control.locator('svg:visible')).toHaveCount(1);
    await expect(control).toHaveText('');
    expect(
      await tracks.evaluateAll((items) => items.map((item) => getComputedStyle(item).animationName))
    ).toEqual(['integration-scroll-left', 'integration-scroll-right', 'integration-scroll-left']);

    const awsSources = await rail
      .locator('a[data-integration-name="AWS"]')
      .first()
      .locator('img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')));
    expect(awsSources).toHaveLength(2);
    expect(awsSources.some((source) => source?.includes('aws-icon.'))).toBe(true);
    expect(awsSources.some((source) => source?.includes('aws-light-icon.'))).toBe(true);

    const railBox = await rail.boundingBox();
    expect(railBox).not.toBeNull();
    if (!railBox) throw new Error('Integration rail must have a bounding box.');
    await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + 32);
    await expect
      .poll(() =>
        tracks.evaluateAll((items) =>
          items.map((item) => getComputedStyle(item).animationPlayState)
        )
      )
      .toEqual(['running', 'running', 'running']);

    await control.click();

    await expect(rail).toHaveClass(/paused/);
    await expect(control).toHaveAccessibleName('Play integration animation');
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await expect(control.locator('svg:visible')).toHaveCount(1);
    expect(
      await tracks.evaluateAll((items) =>
        items.map((item) => getComputedStyle(item).animationPlayState)
      )
    ).toEqual(['paused', 'paused', 'paused']);
  }

  const logoContainment = await page
    .locator('[data-home-integration-rail] .integration-logo:visible')
    .evaluateAll((logos) =>
      logos.every((logo) => {
        const tile = logo.getBoundingClientRect();
        const style = getComputedStyle(logo);
        const content = {
          left: tile.left + Number.parseFloat(style.paddingLeft),
          right: tile.right - Number.parseFloat(style.paddingRight),
          top: tile.top + Number.parseFloat(style.paddingTop),
          bottom: tile.bottom - Number.parseFloat(style.paddingBottom),
        };
        const images = Array.from(
          logo.querySelectorAll<HTMLImageElement>('.integration-icon')
        ).filter((image) => getComputedStyle(image).display !== 'none');

        return images.every((image) => {
          const bounds = image.getBoundingClientRect();
          return (
            bounds.left >= content.left - 1 &&
            bounds.right <= content.right + 1 &&
            bounds.top >= content.top - 1 &&
            bounds.bottom <= content.bottom + 1
          );
        });
      })
    );
  expect(logoContainment).toBe(true);
});

test('lets the user drive the dashboard tour and resume playback', async ({ page }) => {
  const carousel = page.locator('[data-dashboard-carousel]');
  const playback = carousel.locator('[data-playback-toggle]');
  const previous = carousel.getByRole('button', { name: 'Previous view' });
  const next = carousel.getByRole('button', { name: 'Next view' });

  await carousel.scrollIntoViewIfNeeded();

  // The dashboard tour starts playing only after its stage reaches the viewport.
  await expect(carousel).toHaveAttribute('data-viewport-active', '');
  await expect(playback).toHaveAttribute('data-playing', 'true');

  // The visible slide description was removed from the tour footer.
  await expect(carousel.locator('[data-active-label]')).toHaveCount(0);

  // The playback button shares the controls row and sits to the left of prev/next.
  const [playbackBox, previousBox, nextBox] = await Promise.all([
    playback.boundingBox(),
    previous.boundingBox(),
    next.boundingBox(),
  ]);
  expect(playbackBox).not.toBeNull();
  expect(previousBox).not.toBeNull();
  expect(nextBox).not.toBeNull();
  const playbackCenterY = playbackBox!.y + playbackBox!.height / 2;
  const previousCenterY = previousBox!.y + previousBox!.height / 2;
  const nextCenterY = nextBox!.y + nextBox!.height / 2;
  expect(Math.abs(playbackCenterY - previousCenterY)).toBeLessThan(4);
  expect(Math.abs(playbackCenterY - nextCenterY)).toBeLessThan(4);
  expect(playbackBox!.x + playbackBox!.width).toBeLessThan(previousBox!.x);

  // The active slide carries a transform + opacity transition so views glide.
  const activeTransition = await carousel
    .locator('[data-slide][aria-current="true"]')
    .evaluate((slide) => {
      const styles = getComputedStyle(slide);
      return { property: styles.transitionProperty, duration: styles.transitionDuration };
    });
  expect(activeTransition.property).toContain('transform');
  expect(activeTransition.duration).not.toBe('0s');

  // Pausing stops the tour before any manual navigation.
  await playback.click();
  await expect(playback).toHaveAttribute('data-playing', 'false');

  // Manual navigation keeps the tour paused and advances one view.
  const activeSlide = carousel.locator('[data-slide][aria-current="true"]');
  const activeIndex = Number(await activeSlide.getAttribute('data-index'));
  const slideCount = await carousel.locator('[data-slide]').count();
  await next.click();
  await expect(activeSlide).toHaveAttribute('data-index', String((activeIndex + 1) % slideCount));
  await expect(playback).toHaveAttribute('data-playing', 'false');

  // Pressing play resumes the tour.
  await playback.click();
  await expect(playback).toHaveAttribute('data-playing', 'true');
});

test('keeps every dashboard screenshot loaded and fully contained in both themes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const slideLabels = [
    'Resource graph',
    'Resource dashboard',
    'Console logs',
    'Structured logs',
    'Distributed traces',
    'Trace detail',
    'Metrics',
  ];

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('starlight-theme', value), theme);
    await page.reload();
    await dismissCookieConsentIfVisible(page);

    const carousel = page.locator('[data-dashboard-carousel]');
    await carousel.scrollIntoViewIfNeeded();

    for (const [index, label] of slideLabels.entries()) {
      await carousel
        .locator(`[data-dot][data-index="${index}"]`)
        .evaluate((button: HTMLButtonElement) => button.click());
      await expect(carousel.locator('[data-slide][aria-current="true"]')).toHaveAttribute(
        'data-slide-label',
        label
      );

      await expect
        .poll(() =>
          carousel.evaluate((root) => {
            const stage = root.querySelector<HTMLElement>('[data-stage]');
            const activeSlide = root.querySelector<HTMLElement>(
              '[data-slide][aria-current="true"]'
            );
            const image = Array.from(
              activeSlide?.querySelectorAll<HTMLImageElement>('img.dashboard-shot') ?? []
            ).find((candidate) => getComputedStyle(candidate).display !== 'none');
            const stageBounds = stage?.getBoundingClientRect();
            const imageBounds = image?.getBoundingClientRect();

            return {
              naturalSize: image ? [image.naturalWidth, image.naturalHeight] : null,
              contained:
                Boolean(stageBounds && imageBounds) &&
                imageBounds!.left >= stageBounds!.left - 1 &&
                imageBounds!.right <= stageBounds!.right + 1 &&
                imageBounds!.top >= stageBounds!.top - 1 &&
                imageBounds!.bottom <= stageBounds!.bottom + 1,
            };
          })
        )
        .toEqual({
          naturalSize: [1680, 1050],
          contained: true,
        });
    }
  }
});

test('resolves motion immediately when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await dismissCookieConsentIfVisible(page);

  const rail = page.locator('[data-home-integration-rail]');
  await expect(rail).toHaveClass(/paused/);
  await expect(rail.locator('[data-rail-control]')).toBeHidden();
  await expect(page.locator('[data-model-story-toggle]')).toBeHidden();
  await expect(page.locator('[data-environment-motion-control]')).toBeHidden();
  await expect(page.locator('[data-home-agent-badge]')).toHaveCount(3);
  await expect(page.locator('[data-model-story]')).toHaveAttribute('data-story-stage', 'dashboard');

  const motionState = await page.evaluate(() => {
    const reveal = document.querySelector<HTMLElement>('[data-home-reveal]');
    const hero = document.querySelector<HTMLElement>('.home-hero-copy');
    const tracks = Array.from(document.querySelectorAll<HTMLElement>('.rail-track'));
    const topologyCards = Array.from(
      document.querySelectorAll<HTMLElement>('.graph-resource-card')
    );
    const topologyResources = Array.from(document.querySelectorAll<HTMLElement>('.graph-resource'));
    const topologyCycles = Array.from(
      document.querySelectorAll<HTMLElement>('.graph-resource-icon-cycle')
    );
    const environmentPanel = document.querySelector<HTMLElement>(
      '[data-environment-panel]:not([hidden])'
    );
    const environmentCards = Array.from(
      environmentPanel?.querySelectorAll<HTMLElement>('.topology-node-card') ?? []
    );
    const environmentNodes = Array.from(
      environmentPanel?.querySelectorAll<HTMLElement>('.topology-node') ?? []
    );
    const environmentCycles = Array.from(
      environmentPanel?.querySelectorAll<HTMLElement>('.topology-node-icon-cycle') ?? []
    );
    const environmentCore = environmentPanel?.querySelector<HTMLElement>('.topology-core');

    return {
      heroAnimation: hero ? getComputedStyle(hero).animationName : null,
      revealOpacity: reveal ? getComputedStyle(reveal).opacity : null,
      railAnimations: tracks.map((track) => getComputedStyle(track).animationName),
      topologyCardAnimations: topologyCards.map((card) => getComputedStyle(card).animationName),
      topologyScrollAnimations: topologyResources.map(
        (resource) => getComputedStyle(resource).animationName
      ),
      visibleTopologyCycleIcons: topologyCycles.map(
        (cycle) =>
          Array.from(cycle.querySelectorAll<HTMLElement>('.graph-resource-icon')).filter(
            (icon) => Number.parseFloat(getComputedStyle(icon).opacity) > 0.5
          ).length
      ),
      environmentCardAnimations: environmentCards.map(
        (card) => getComputedStyle(card).animationName
      ),
      environmentScrollAnimations: environmentNodes.map(
        (node) => getComputedStyle(node).animationName
      ),
      environmentCoreRadarAnimations: environmentCore
        ? [
            getComputedStyle(environmentCore, '::before').animationName,
            getComputedStyle(environmentCore, '::after').animationName,
          ]
        : [],
      visibleEnvironmentCycleIcons: environmentCycles.map(
        (cycle) =>
          Array.from(cycle.querySelectorAll<HTMLElement>('.topology-node-icon')).filter(
            (icon) => Number.parseFloat(getComputedStyle(icon).opacity) > 0.5
          ).length
      ),
    };
  });

  expect(motionState).toEqual({
    heroAnimation: 'none',
    revealOpacity: '1',
    railAnimations: ['none', 'none', 'none'],
    topologyCardAnimations: ['none', 'none', 'none', 'none'],
    topologyScrollAnimations: ['none', 'none', 'none', 'none'],
    visibleTopologyCycleIcons: [1, 1, 1, 1],
    environmentCardAnimations: ['none', 'none', 'none', 'none'],
    environmentScrollAnimations: ['none', 'none', 'none', 'none'],
    environmentCoreRadarAnimations: ['none', 'none'],
    visibleEnvironmentCycleIcons: [1, 1, 1, 1],
  });
});

test('uses bounded hero motion to advance product proof on large viewports', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 1152 || viewport.height < 768,
    'The hero uses normal document flow below the desktop motion breakpoint.'
  );

  const before = await page.evaluate(() => {
    const copy = document.querySelector<HTMLElement>('.home-hero-copy');
    const product = document.querySelector<HTMLElement>('.home-hero-product');
    if (!copy || !product) throw new Error('The homepage hero did not render.');

    return {
      copyOpacity: Number.parseFloat(getComputedStyle(copy).opacity),
      productTop: product.getBoundingClientRect().top,
    };
  });

  await page.evaluate(() => window.scrollTo(0, 320));

  await expect
    .poll(() =>
      page
        .locator('.home-hero-copy')
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity))
    )
    .toBeLessThan(before.copyOpacity);

  const productTop = await page
    .locator('.home-hero-product')
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(productTop).toBeLessThan(before.productTop);

  await page.evaluate(() => window.scrollTo(0, 600));

  const recededCopyOpacity = await page
    .locator('.home-hero-copy')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity));
  expect(recededCopyOpacity).toBeLessThanOrEqual(0.12);
});

test('keeps primary controls visible and focused in forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.reload();
  await dismissCookieConsentIfVisible(page);

  const primaryAction = page.getByRole('link', { name: 'Try Aspire' }).first();
  const environmentAction = page.getByRole('button', { name: 'Production' });

  await expect(primaryAction).toBeVisible();
  await primaryAction.focus();
  await expect(primaryAction).toBeFocused();
  await expect(primaryAction).not.toHaveCSS('outline-style', 'none');

  await environmentAction.scrollIntoViewIfNeeded();
  await environmentAction.focus();
  await expect(environmentAction).toBeFocused();
  await expect(environmentAction).not.toHaveCSS('outline-style', 'none');
});

test('passes WCAG AA checks in the dark theme', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('starlight-theme', 'dark'));
  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .options({
      rules: {
        'color-contrast': { enabled: true },
      },
    })
    .analyze();

  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(' ')),
  }));

  expect(
    violations,
    violations.length === 0 ? undefined : JSON.stringify(violations, null, 2)
  ).toEqual([]);
});
