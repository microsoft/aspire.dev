// Temporary workaround for https://github.com/dlcastillop/starlight-page-actions/pull/133.
// Remove this module and its Head.astro import after adopting a fixed package
// release that has aged at least seven days.
const actionsSelector = '.actions-container, .toc-actions';
const menuSelector = '.actions-container .dropdown > #dropdown-menu';
const resetTimers = new Map<HTMLButtonElement, number>();
let requests = new AbortController();

function closeMenus() {
  document.querySelectorAll(menuSelector).forEach((menu) => menu.classList.remove('show'));
}

async function copyMarkdown(button: HTMLButtonElement) {
  if (button.disabled) return;
  const { signal } = requests;
  const previousTimer = resetTimers.get(button);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);
  resetTimers.delete(button);
  button.classList.remove('copied', 'error');
  button.disabled = true;
  let result = 'copied';
  try {
    const response = await fetch(`${button.dataset.path}.md`, { signal });
    if (!response.ok) throw new Error(`Failed to fetch Markdown: ${response.status}`);
    const markdown = await response.text();
    if (signal.aborted) return;
    await navigator.clipboard.writeText(markdown);
  } catch (error) {
    if (signal.aborted) return;
    console.error(error);
    result = 'error';
  } finally {
    button.disabled = false;
    if (!signal.aborted) {
      button.classList.add(result);
      resetTimers.set(
        button,
        window.setTimeout(() => {
          button.classList.remove(result);
          resetTimers.delete(button);
        }, 3000)
      );
    }
  }
}

function handleClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  const target = event.target;
  const actions = target.closest(actionsSelector);
  const copy = target.closest<HTMLButtonElement>('button[data-page-action="copy-markdown"]');
  const toggle = target.closest<HTMLButtonElement>('.dropdown > button#dropdown-toggle');
  if (actions && (copy || toggle)) {
    // Capture owns these clicks even on the first page, where the plugin also
    // attaches handlers. Delegation keeps working when ClientRouter replaces DOM.
    event.stopImmediatePropagation();
    if (copy) {
      void copyMarkdown(copy);
    } else if (toggle) {
      const menu = toggle.parentElement?.querySelector<HTMLElement>(':scope > #dropdown-menu');
      const wasOpen = menu?.classList.contains('show');
      closeMenus();
      if (!wasOpen) menu?.classList.add('show');
    }
    return;
  }
  if (actions && target.closest('#dropdown-menu')) {
    event.stopImmediatePropagation();
    return;
  }
  closeMenus();
}

function resetPage() {
  requests.abort();
  requests = new AbortController();
  for (const [button, timer] of resetTimers) {
    window.clearTimeout(timer);
    button.classList.remove('copied', 'error');
  }
  resetTimers.clear();
  closeMenus();
}

document.addEventListener('click', handleClick, { capture: true });
document.addEventListener('astro:before-swap', resetPage);
import.meta.hot?.dispose(() => {
  document.removeEventListener('click', handleClick, { capture: true });
  document.removeEventListener('astro:before-swap', resetPage);
  resetPage();
});
