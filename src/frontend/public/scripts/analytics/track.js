/* global document, IntersectionObserver, location, Node, window */

(function () {
  var FUNNEL_EVENT_NAME = 'aspire.dev/funnel/step';
  var CLI_INSTALL_FUNNEL = 'cli_install';
  var GETTING_STARTED_FUNNEL = 'getting_started';
  var CLI_ENTRY_MARKER_KEY = 'aspire-cli-install-entry';
  var SEARCH_DESTINATION_MARKER_KEY = 'aspire-search-destination';
  var NOT_FOUND_DESTINATION_MARKER_KEY = 'aspire-not-found-destination';
  var CLI_ENTRY_MARKER_TTL_MS = 30 * 1000;
  var CONTINUATION_MARKER_TTL_MS = 5 * 60 * 1000;
  var lastRoutePath = null;
  var observedFunnelSteps = new WeakSet();
  var pendingTroubleshootingReturn = null;
  var troubleshootingWasHidden = false;
  var inferredIntegrationContext = null;

  var funnelSteps = {
    cli_install: {
      entry: 1,
      options_viewed: 2,
      command_copied: 3,
      script_requested: 4,
    },
    getting_started: {
      first_app_viewed: 1,
      create_command_copied: 2,
      run_command_copied: 3,
      next_step_clicked: 4,
    },
    search_success: {
      search_opened: 1,
      results_shown: 2,
      no_results: 2,
      result_selected: 3,
      destination_action: 4,
    },
    integration_adoption: {
      gallery_viewed: 1,
      filter_used: 2,
      integration_selected: 3,
      install_command_copied: 4,
      configuration_copied: 5,
    },
    deployment_intent: {
      deploy_guide_viewed: 1,
      target_selected: 2,
      prerequisite_copied: 3,
      deploy_command_copied: 4,
      verification_or_troubleshooting: 5,
    },
    troubleshooting_recovery: {
      troubleshooting_viewed: 1,
      issue_selected: 2,
      remediation_copied: 3,
      return_to_task: 4,
      file_issue: 4,
    },
    not_found_recovery: {
      not_found_viewed: 1,
      recovery_action: 2,
      valid_destination_loaded: 3,
    },
    existing_app_adoption: {
      guide_viewed: 1,
      approach_selected: 2,
      setup_command_copied: 3,
      run_command_copied: 4,
      next_step_clicked: 5,
    },
  };

  var optionalDimensions = {
    surface: [
      'header',
      'site_tools',
      'homepage',
      'install_modal',
      'install_page',
      'first_app_page',
      'site_search',
      'search_destination',
      'integrations_gallery',
      'integration_page',
      'deployment_page',
      'troubleshooting_page',
      'not_found_page',
      'existing_app_page',
    ],
    entryType: ['cta', 'direct'],
    method: [
      'script',
      'homebrew',
      'npm',
      'nuget',
      'winget',
      'mise',
      'nix',
      'aspire_cli',
      'dotnet_cli',
      'pnpm',
      'yarn',
      'bun',
      'file_directive',
      'package_reference',
    ],
    platform: ['macos', 'linux', 'windows', 'unix', 'cross_platform'],
    channel: ['release', 'staging', 'dev'],
    language: ['csharp', 'typescript', 'python', 'javascript'],
    destination: [
      'deploy',
      'testing',
      'verification',
      'troubleshooting',
      'return_to_task',
      'github_issue',
      'executable_resources',
      'vscode_extension',
    ],
    queryLength: ['one_to_three', 'four_to_ten', 'eleven_to_thirty', 'thirty_plus'],
    resultCount: ['zero', 'one_to_five', 'six_to_twenty', 'twenty_plus'],
    selectedRank: ['first', 'two_to_five', 'six_plus', 'api_reference'],
    searchTarget: ['docs', 'csharp_api', 'typescript_api'],
    resultType: ['docs', 'api_reference', 'integration', 'reference', 'other'],
    actionKind: ['code_copy', 'internal_navigation', 'external_navigation', 'content_control'],
    filterType: ['search', 'official', 'community', 'hosting', 'client', 'tag'],
    publisher: ['official', 'community'],
    integrationKind: ['hosting', 'client'],
    target: ['docker_compose', 'azure_container_apps'],
    recoveryAction: ['back', 'homepage', 'docs', 'search', 'suggested_page'],
    approach: ['ai_agent', 'manual', 'cli'],
  };

  var boundedDimensions = {
    integration: /^[a-z0-9@/._-]{1,100}$/,
    issue: /^[a-z0-9][a-z0-9_-]{0,63}$/,
  };

  var languageFunnels = {
    getting_started: true,
    integration_adoption: true,
    deployment_intent: true,
    existing_app_adoption: true,
  };

  if (
    !window.analytics ||
    !window.analytics.__initialized ||
    typeof window.analytics.trackPageAction !== 'function'
  ) {
    console.debug('[track] Analytics not initialized, skipping event tracking setup.');
    return;
  }

  if (window.analytics.__trackingBound) {
    console.debug('[track] Event tracking already bound, skipping.');
    return;
  }

  window.analytics.__trackingBound = true;

  function normalizePathname(pathname) {
    var segments = pathname.split('/').filter(Boolean);
    var locale = (document.documentElement.lang || 'en').toLowerCase();
    var firstSegment = (segments[0] || '').toLowerCase();

    if (firstSegment === locale || firstSegment === locale.split('-')[0]) {
      segments.shift();
    }

    return segments.length ? '/' + segments.join('/') + '/' : '/';
  }

  function normalizePath() {
    return normalizePathname(location.pathname);
  }

  function getTelemetryPath() {
    return document.querySelector('[data-funnel="not_found_recovery"][data-funnel-view]')
      ? '/404/'
      : normalizePath();
  }

  function clearCliEntryMarker() {
    try {
      window.sessionStorage.removeItem(CLI_ENTRY_MARKER_KEY);
    } catch (err) {
      console.debug('[track] Failed to clear CLI entry marker:', err);
    }
  }

  function rememberCliEntry() {
    try {
      window.sessionStorage.setItem(CLI_ENTRY_MARKER_KEY, String(Date.now()));
    } catch (err) {
      console.debug('[track] Failed to persist CLI entry marker:', err);
    }
  }

  function consumeRecentCliEntry() {
    try {
      var value = Number(window.sessionStorage.getItem(CLI_ENTRY_MARKER_KEY));
      window.sessionStorage.removeItem(CLI_ENTRY_MARKER_KEY);
      return Number.isFinite(value) && Date.now() - value <= CLI_ENTRY_MARKER_TTL_MS;
    } catch (err) {
      console.debug('[track] Failed to read CLI entry marker:', err);
      return false;
    }
  }

  function getInternalDestinationPath(href) {
    if (!href) return null;

    try {
      var destination = new URL(href, location.href);
      return destination.origin === location.origin ? destination.pathname : null;
    } catch (err) {
      console.debug('[track] Failed to parse funnel destination:', err);
      return null;
    }
  }

  function writeContinuationMarker(key, destinationPath, dimensions) {
    if (!destinationPath) return;

    try {
      window.sessionStorage.setItem(
        key,
        JSON.stringify({
          destinationPath: destinationPath,
          expiresAt: Date.now() + CONTINUATION_MARKER_TTL_MS,
          dimensions: dimensions || {},
        })
      );
    } catch (err) {
      console.debug('[track] Failed to persist funnel continuation:', err);
    }
  }

  function readContinuationMarker(key, consume) {
    try {
      var value = window.sessionStorage.getItem(key);
      if (!value) return null;

      var marker = JSON.parse(value);
      if (
        !marker ||
        typeof marker.destinationPath !== 'string' ||
        typeof marker.expiresAt !== 'number' ||
        marker.expiresAt < Date.now()
      ) {
        window.sessionStorage.removeItem(key);
        return null;
      }

      if (consume) {
        window.sessionStorage.removeItem(key);
      }

      return marker;
    } catch (err) {
      console.debug('[track] Failed to read funnel continuation:', err);
      return null;
    }
  }

  function clearContinuationMarker(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (err) {
      console.debug('[track] Failed to clear funnel continuation:', err);
    }
  }

  function copyOptionalDimensions(details, properties) {
    Object.keys(optionalDimensions).forEach(function (key) {
      var value = details[key];
      if (value === undefined || value === null || value === '') return;

      if (optionalDimensions[key].indexOf(value) === -1) {
        console.debug('[track] Ignoring unsupported funnel dimension:', key, value);
        return;
      }

      properties[key] = value;
    });

    Object.keys(boundedDimensions).forEach(function (key) {
      var value = details[key];
      if (value === undefined || value === null || value === '') return;

      if (typeof value !== 'string' || !boundedDimensions[key].test(value)) {
        console.debug('[track] Ignoring invalid bounded funnel dimension:', key, value);
        return;
      }

      properties[key] = value;
    });
  }

  function getSelectedLanguage() {
    var selected = document.querySelector(
      '#pivot-selector-aspire-lang [data-pivot-option].active, #pivot-selector-lang [data-pivot-option].active'
    );
    if (selected) return selected.dataset.pivotOption;

    var selectedTab = document.querySelector(
      'starlight-tabs[data-sync-key="aspire-lang"] [role="tab"][aria-selected="true"]'
    );
    var label = selectedTab && selectedTab.textContent ? selectedTab.textContent.trim() : '';
    if (label === 'C#') return 'csharp';
    if (label === 'TypeScript') return 'typescript';
    return null;
  }

  function trackFunnelStep(details) {
    if (!details || !details.funnel || !details.step) {
      console.debug('[track] Funnel event requires funnel and step values.');
      return false;
    }

    var steps = funnelSteps[details.funnel];
    var stepIndex = steps && steps[details.step];

    if (!stepIndex) {
      console.debug('[track] Ignoring unsupported funnel step:', details.funnel, details.step);
      return false;
    }

    var telemetryPath = getTelemetryPath();
    var properties = {
      schemaVersion: 1,
      funnel: details.funnel,
      step: details.step,
      stepIndex: stepIndex,
      locale: document.documentElement.lang || 'en',
      path: telemetryPath,
    };

    copyOptionalDimensions(details, properties);
    if (languageFunnels[details.funnel] && !properties.language) {
      var selectedLanguage = getSelectedLanguage();
      if (optionalDimensions.language.indexOf(selectedLanguage) !== -1) {
        properties.language = selectedLanguage;
      }
    }

    try {
      window.analytics.trackPageAction(
        {
          name: FUNNEL_EVENT_NAME,
          uri: location.origin + telemetryPath,
          pageName: document.title || properties.path,
          actionType: details.actionType === 'CL' ? 'CL' : 'O',
          isManual: true,
        },
        properties
      );
      console.debug('[track] Funnel step tracked:', properties);
      return true;
    } catch (err) {
      console.debug('[track] Failed to track funnel step:', err);
      return false;
    }
  }

  function readDeclarativeStep(stepTarget) {
    var root = stepTarget.closest('[data-funnel]');
    if (!root) {
      console.debug('[track] Funnel step is missing a data-funnel ancestor.');
      return null;
    }

    var details = {
      funnel: root.dataset.funnel,
      step: stepTarget.dataset.funnelStep || root.dataset.funnelStep,
      actionType: 'CL',
    };

    Object.keys(optionalDimensions).forEach(function (key) {
      var dataKey = 'funnel' + key.charAt(0).toUpperCase() + key.slice(1);
      details[key] = stepTarget.dataset[dataKey] || root.dataset[dataKey];
    });

    Object.keys(boundedDimensions).forEach(function (key) {
      var dataKey = 'funnel' + key.charAt(0).toUpperCase() + key.slice(1);
      details[key] = stepTarget.dataset[dataKey] || root.dataset[dataKey];
    });

    return details;
  }

  function findPrecedingContext(selector, element) {
    var contexts = Array.from(document.querySelectorAll(selector));
    var selected = null;

    contexts.forEach(function (context) {
      if (
        context.contains(element) ||
        context.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        selected = context;
      }
    });

    return selected;
  }

  function classifyIntegrationInstall(code) {
    if (/^\s*aspire\s+add\b/m.test(code)) return { method: 'aspire_cli' };
    if (/^\s*dotnet\s+add\b.*\bpackage\b/m.test(code)) return { method: 'dotnet_cli' };
    if (/^\s*#:package\s+/m.test(code)) return { method: 'file_directive' };
    if (/<PackageReference\s+Include=/i.test(code)) return { method: 'package_reference' };
    var packageManager = code.match(/^\s*(npm|pnpm|yarn|bun)\s+(add|install)\b/m);
    if (packageManager) return { method: packageManager[1] };
    return null;
  }

  function extractIntegrationId(code) {
    var match =
      code.match(/<PackageReference\s+Include=["']([^"']+)["']/i) ||
      code.match(/^\s*#:package\s+([^@\s]+)/m) ||
      code.match(/^\s*dotnet\s+add\b.*\bpackage\s+([^\s]+)/m) ||
      code.match(/^\s*(?:npm\s+install|pnpm\s+add|yarn\s+add|bun\s+add)\s+([@a-z0-9/._-]+)/im);
    return match && match[1] ? match[1].toLowerCase() : null;
  }

  function getIntegrationPathId() {
    var path = normalizePath();
    if (path === '/integrations/' || path === '/integrations/gallery/') return null;
    if (!path.startsWith('/integrations/')) return null;
    return path.slice('/integrations/'.length, -1);
  }

  function trackIntegrationCodeCopy(clickedElement) {
    if (!clickedElement.closest('.copy button')) return;
    if (clickedElement.closest('[data-funnel-step]')) return;

    var context = findPrecedingContext('[data-integration-context]', clickedElement);
    var pathIntegration = getIntegrationPathId();
    if (!context && !pathIntegration) return;

    var figure = clickedElement.closest('figure');
    var code = figure && figure.querySelector('code');
    var codeText = code && code.textContent ? code.textContent : '';
    var install = classifyIntegrationInstall(codeText);
    var extractedIntegration = extractIntegrationId(codeText);
    if (
      inferredIntegrationContext &&
      inferredIntegrationContext.path !== normalizePath()
    ) {
      inferredIntegrationContext = null;
    }
    var integration =
      (context && context.dataset.funnelIntegration) ||
      extractedIntegration ||
      (inferredIntegrationContext && inferredIntegrationContext.integration) ||
      pathIntegration;
    var publisher =
      (context && context.dataset.funnelPublisher) ||
      (inferredIntegrationContext && inferredIntegrationContext.publisher) ||
      (integration && integration.startsWith('aspire.') ? 'official' : null);
    var integrationKind =
      (context && context.dataset.funnelIntegrationKind) ||
      (inferredIntegrationContext && inferredIntegrationContext.integrationKind);
    if (!integrationKind && pathIntegration) {
      if (pathIntegration.endsWith('-host')) integrationKind = 'hosting';
      if (pathIntegration.endsWith('-connect')) integrationKind = 'client';
    }

    if (install && extractedIntegration) {
      inferredIntegrationContext = {
        path: normalizePath(),
        integration: extractedIntegration,
        publisher: publisher,
        integrationKind: integrationKind,
      };
    }

    trackFunnelStep({
      funnel: 'integration_adoption',
      step: install ? 'install_command_copied' : 'configuration_copied',
      surface: 'integration_page',
      integration: integration,
      publisher: publisher,
      integrationKind: integrationKind,
      method: install && install.method,
      actionType: 'CL',
    });
  }

  function deploymentTargetFromTab(tab) {
    var label = tab && tab.textContent ? tab.textContent.trim().toLowerCase() : '';
    if (label === 'docker compose') return 'docker_compose';
    if (label === 'azure') return 'azure_container_apps';
    return null;
  }

  function trackDeploymentTarget(tab) {
    var target = deploymentTargetFromTab(tab);
    if (!target) return;

    trackFunnelStep({
      funnel: 'deployment_intent',
      step: 'target_selected',
      surface: 'deployment_page',
      target: target,
      actionType: 'CL',
    });
  }

  function trackContextualLink(clickedElement) {
    var link = clickedElement.closest('a[href]');
    if (!link) return;

    var currentPath = normalizePath();
    var url;
    try {
      url = new URL(link.href, location.href);
    } catch (err) {
      console.debug('[track] Failed to parse contextual funnel link:', err);
      return;
    }

    if (
      currentPath === '/get-started/deploy-first-app/' &&
      url.origin === location.origin &&
      normalizePathname(url.pathname) === '/get-started/troubleshooting/'
    ) {
      trackFunnelStep({
        funnel: 'deployment_intent',
        step: 'verification_or_troubleshooting',
        surface: 'deployment_page',
        destination: 'troubleshooting',
        actionType: 'CL',
      });
      return;
    }

    if (currentPath === '/get-started/add-aspire-existing-app/' && url.origin === location.origin) {
      var destinationPath = getInternalDestinationPath(url.href);
      var destinationMap = {
        '/app-host/executable-resources/': 'executable_resources',
        '/get-started/deploy-first-app/': 'deploy',
        '/get-started/aspire-vscode-extension/': 'vscode_extension',
        '/get-started/troubleshooting/': 'troubleshooting',
      };
      var destination = destinationMap[destinationPath];
      if (destination) {
        trackFunnelStep({
          funnel: 'existing_app_adoption',
          step: 'next_step_clicked',
          surface: 'existing_app_page',
          destination: destination,
          actionType: 'CL',
        });
        return;
      }
    }

    if (
      currentPath === '/get-started/troubleshooting/' &&
      url.hostname === 'github.com' &&
      url.pathname.toLowerCase().startsWith('/microsoft/aspire/issues')
    ) {
      var issueContext = findPrecedingContext('[data-troubleshooting-issue]', link);
      trackFunnelStep({
        funnel: 'troubleshooting_recovery',
        step: 'file_issue',
        surface: 'troubleshooting_page',
        issue: issueContext && issueContext.dataset.funnelIssue,
        destination: 'github_issue',
        actionType: 'CL',
      });
    }
  }

  function handleDeclarativeClick(event) {
    var clickedElement = event.target;
    if (!clickedElement || typeof clickedElement.closest !== 'function') return;

    trackSearchDestinationAction(clickedElement);
    trackIntegrationCodeCopy(clickedElement);
    trackContextualLink(clickedElement);

    var deploymentTab = clickedElement.closest(
      'starlight-tabs[data-sync-key="deploy-target"] [role="tab"]'
    );
    if (deploymentTab) {
      trackDeploymentTarget(deploymentTab);
    }

    if (clickedElement.closest('[data-cli-entry-continuation]')) {
      rememberCliEntry();
    }

    var stepTarget = clickedElement.closest('[data-funnel-step]');
    if (!stepTarget) return;

    if (stepTarget.dataset.funnelTrigger === 'copy' && !clickedElement.closest('.copy button')) {
      return;
    }

    var details = readDeclarativeStep(stepTarget);
    if (!details) return;

    if (details.funnel === CLI_INSTALL_FUNNEL && details.step === 'entry') {
      rememberCliEntry();
    }

    if (details.funnel === 'not_found_recovery' && details.step === 'recovery_action') {
      var recoveryLink = clickedElement.closest('a[href]');
      writeContinuationMarker(
        NOT_FOUND_DESTINATION_MARKER_KEY,
        details.recoveryAction === 'back'
          ? null
          : recoveryLink && getInternalDestinationPath(recoveryLink.href),
        { recoveryAction: details.recoveryAction }
      );
    }

    var tracked = trackFunnelStep(details);
    if (
      tracked &&
      details.funnel === 'troubleshooting_recovery' &&
      details.step === 'remediation_copied'
    ) {
      pendingTroubleshootingReturn = { issue: details.issue };
      troubleshootingWasHidden = false;
    }
  }

  function handleCustomStep(event) {
    var details = event && event.detail;
    if (
      details &&
      details.funnel === CLI_INSTALL_FUNNEL &&
      details.step === 'options_viewed' &&
      details.surface === 'install_modal'
    ) {
      clearCliEntryMarker();
    }

    if (details && details.funnel === 'search_success' && details.step === 'result_selected') {
      writeContinuationMarker(
        SEARCH_DESTINATION_MARKER_KEY,
        getInternalDestinationPath(details.destinationHref),
        {
          queryLength: details.queryLength,
          resultCount: details.resultCount,
          selectedRank: details.selectedRank,
          searchTarget: details.searchTarget,
          resultType: details.resultType,
        }
      );
    }

    trackFunnelStep(details);
  }

  function getActionKind(clickedElement) {
    if (clickedElement.closest('.copy button')) return 'code_copy';

    var link = clickedElement.closest('main a[href]');
    if (link) {
      return getInternalDestinationPath(link.href) ? 'internal_navigation' : 'external_navigation';
    }

    return clickedElement.closest('main button, main [role="tab"]') ? 'content_control' : null;
  }

  function trackSearchDestinationAction(clickedElement) {
    var marker = readContinuationMarker(SEARCH_DESTINATION_MARKER_KEY, false);
    if (!marker || marker.destinationPath !== location.pathname) return;

    var actionKind = getActionKind(clickedElement);
    if (!actionKind) return;

    var details = Object.assign(
      {
        funnel: 'search_success',
        step: 'destination_action',
        surface: 'search_destination',
        actionKind: actionKind,
        actionType: 'CL',
      },
      marker.dimensions || {}
    );

    if (trackFunnelStep(details)) {
      clearContinuationMarker(SEARCH_DESTINATION_MARKER_KEY);
    }
  }

  function trackPageMilestone() {
    var milestone = document.querySelector('[data-funnel-view][data-funnel][data-funnel-step]');
    if (!milestone) return;

    var details = readDeclarativeStep(milestone);
    if (!details) return;

    details.actionType = 'O';
    trackFunnelStep(details);
  }

  var observedStepObserver =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observedStepObserver.unobserve(entry.target);
            var details = readDeclarativeStep(entry.target);
            if (!details) return;
            details.actionType = 'O';
            trackFunnelStep(details);
          });
        })
      : null;

  function observeFunnelSteps() {
    if (!observedStepObserver) return;

    document
      .querySelectorAll('[data-funnel-step][data-funnel-trigger="view"]')
      .forEach(function (element) {
        if (observedFunnelSteps.has(element)) return;
        observedFunnelSteps.add(element);
        observedStepObserver.observe(element);
      });
  }

  function handleDeploymentTargetKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;

    var tabs = target.closest('starlight-tabs[data-sync-key="deploy-target"]');
    if (!tabs) return;

    window.requestAnimationFrame(function () {
      trackDeploymentTarget(tabs.querySelector('[role="tab"][aria-selected="true"]'));
    });
  }

  function handleVisibilityChange() {
    if (!pendingTroubleshootingReturn) return;

    if (document.visibilityState === 'hidden') {
      troubleshootingWasHidden = true;
      return;
    }

    if (
      document.visibilityState === 'visible' &&
      troubleshootingWasHidden &&
      normalizePath() === '/get-started/troubleshooting/'
    ) {
      trackFunnelStep({
        funnel: 'troubleshooting_recovery',
        step: 'return_to_task',
        surface: 'troubleshooting_page',
        issue: pendingTroubleshootingReturn.issue,
        destination: 'return_to_task',
      });
      pendingTroubleshootingReturn = null;
      troubleshootingWasHidden = false;
    }
  }

  function trackNotFoundRecovery() {
    var marker = readContinuationMarker(NOT_FOUND_DESTINATION_MARKER_KEY, false);
    if (!marker || marker.destinationPath !== location.pathname) return;
    if (document.querySelector('[data-funnel="not_found_recovery"][data-funnel-view]')) return;

    var details = Object.assign(
      {
        funnel: 'not_found_recovery',
        step: 'valid_destination_loaded',
        surface: 'not_found_page',
      },
      marker.dimensions || {}
    );

    if (trackFunnelStep(details)) {
      clearContinuationMarker(NOT_FOUND_DESTINATION_MARKER_KEY);
    }
  }

  function trackRouteSteps() {
    if (lastRoutePath === location.pathname) return;
    lastRoutePath = location.pathname;

    var path = normalizePath();
    if (path === '/get-started/install-cli/') {
      if (!consumeRecentCliEntry()) {
        trackFunnelStep({
          funnel: CLI_INSTALL_FUNNEL,
          step: 'entry',
          surface: 'install_page',
          entryType: 'direct',
        });
      }

      trackFunnelStep({
        funnel: CLI_INSTALL_FUNNEL,
        step: 'options_viewed',
        surface: 'install_page',
      });
    } else if (path === '/get-started/first-app/') {
      trackFunnelStep({
        funnel: GETTING_STARTED_FUNNEL,
        step: 'first_app_viewed',
        surface: 'first_app_page',
      });
    } else if (path === '/integrations/gallery/') {
      trackFunnelStep({
        funnel: 'integration_adoption',
        step: 'gallery_viewed',
        surface: 'integrations_gallery',
      });
    } else if (path === '/get-started/deploy-first-app/') {
      trackFunnelStep({
        funnel: 'deployment_intent',
        step: 'deploy_guide_viewed',
        surface: 'deployment_page',
      });
    } else if (path === '/get-started/troubleshooting/') {
      trackFunnelStep({
        funnel: 'troubleshooting_recovery',
        step: 'troubleshooting_viewed',
        surface: 'troubleshooting_page',
      });
    } else if (path === '/get-started/add-aspire-existing-app/') {
      trackFunnelStep({
        funnel: 'existing_app_adoption',
        step: 'guide_viewed',
        surface: 'existing_app_page',
      });
    }

    trackPageMilestone();
    trackNotFoundRecovery();
  }

  var aspireAnalytics = window.aspireAnalytics || {};
  aspireAnalytics.trackFunnelStep = trackFunnelStep;
  window.aspireAnalytics = aspireAnalytics;

  document.addEventListener('click', handleDeclarativeClick, true);
  document.addEventListener('aspire:funnel-step', handleCustomStep);
  document.addEventListener('keydown', handleDeploymentTargetKeydown);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('astro:page-load', trackRouteSteps);
  document.addEventListener('astro:page-load', observeFunnelSteps);
  trackRouteSteps();
  observeFunnelSteps();

  console.debug('[track] Funnel tracking bound.');
})();
