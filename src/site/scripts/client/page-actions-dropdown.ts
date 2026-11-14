// Ported from src/frontend/node_modules/starlight-page-actions/components/Dropdown.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
let listeners: AbortController | undefined;

function initializeDropdowns() {
  listeners?.abort();
  listeners = new AbortController();
  const { signal } = listeners;
  const closeAll: Array<() => void> = [];

  document.querySelectorAll<HTMLElement>("[data-page-action-dropdown]").forEach((root) => {
    const button = root.querySelector<HTMLButtonElement>("button");
    const menu = root.querySelector<HTMLElement>(".dropdown-menu");
    if (!button || !menu) return;

    const close = () => {
      menu.hidden = true;
      menu.classList.remove("show");
      button.setAttribute("aria-expanded", "false");
    };
    closeAll.push(close);
    close();

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = !menu.hidden;
      closeAll.forEach((close) => close());
      if (wasOpen) return;

      menu.hidden = false;
      menu.classList.add("show");
      button.setAttribute("aria-expanded", "true");
      const anchor = button.getBoundingClientRect();
      const width = menu.getBoundingClientRect().width;
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const below = Math.max(44, innerHeight - anchor.bottom - 16);
      const above = Math.max(44, anchor.top - headerBottom - 16);
      const flip = below < Math.min(menu.scrollHeight, 256) && above > below;
      menu.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - width - 8))}px`;
      menu.style.right = "auto";
      menu.style.maxHeight = `${flip ? above : below}px`;
      menu.style.top = `${flip ? Math.max(headerBottom + 8, anchor.top - Math.min(menu.scrollHeight, above) - 8) : anchor.bottom + 8}px`;
      menu.style.bottom = "auto";
    }, { signal });

    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
        close();
        button.focus();
      }
    }, { signal });
    root.addEventListener("focusout", (event) => {
      if (event.relatedTarget instanceof Node && !root.contains(event.relatedTarget)) close();
    }, { signal });
  });

  document.addEventListener("click", () => closeAll.forEach((close) => close()), { signal });
  window.addEventListener("resize", () => closeAll.forEach((close) => close()), { signal });
}

initializeDropdowns();
export {};
