// Ported from src/frontend/node_modules/starlight-page-actions/components/PageActions.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
let listeners: AbortController | undefined;
const resetTimers = new Set<ReturnType<typeof setTimeout>>();

function disposeCopyButtons() {
  listeners?.abort();
  resetTimers.forEach(clearTimeout);
  resetTimers.clear();
}

function initializeCopyButtons() {
  disposeCopyButtons();
  listeners = new AbortController();
  const { signal } = listeners;
  document.querySelectorAll<HTMLButtonElement>('[data-page-action="copy-markdown"]').forEach((copyButton) => {
    copyButton.dataset.pageActionReady = "true";
    copyButton.addEventListener("click", async () => {
      let copyButtonClass: "copied" | "error" = "copied";
      try {
        copyButton.disabled = true;
        const res = await fetch(`${copyButton.dataset.path}.md`, { signal });
        if (!res.ok) throw new Error(`Unable to copy Markdown: HTTP ${res.status}`);
        const contentForClipboard = await res.text();
        if (!signal.aborted) await navigator.clipboard.writeText(contentForClipboard);
      } catch (error) {
        if (signal.aborted) return;
        console.error(error);
        copyButtonClass = "error";
      } finally {
        copyButton.disabled = false;
        if (!signal.aborted) {
          copyButton.classList.add(copyButtonClass);
          const timer = setTimeout(() => {
            copyButton.classList.remove(copyButtonClass);
            resetTimers.delete(timer);
          }, 3000);
          resetTimers.add(timer);
        }
      }
    }, { signal });
  });
}
initializeCopyButtons();
export {};
