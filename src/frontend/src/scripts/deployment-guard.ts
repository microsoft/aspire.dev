import type { TransitionBeforePreparationEvent } from 'astro:transitions/client';

const deploymentSelector = 'meta[name="git-commit-id"]';
const runningDeployment =
  document.querySelector<HTMLMetaElement>(deploymentSelector)?.content.trim() ?? '';

document.addEventListener('astro:before-preparation', (event: TransitionBeforePreparationEvent) => {
  const load = event.loader;
  event.loader = async () => {
    await load();
    if (event.defaultPrevented || event.signal.aborted) return;

    const incomingDeployment =
      event.newDocument.querySelector<HTMLMetaElement>(deploymentSelector)?.content.trim() ?? '';
    if (runningDeployment === incomingDeployment) return;

    if (!runningDeployment || !incomingDeployment) {
      console.warn('[navigation] Missing deployment identity; loading a new document.');
    }
    // Canceling preparation delegates to browser navigation before any DOM swap
    // or incoming script execution. A swap cannot replace the old JS environment.
    event.preventDefault();
  };
});
