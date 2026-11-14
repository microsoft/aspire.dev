// Inline script placed right after the sidebar tree, from Starlight's SidebarPersister.astro second
// is:inline script (0.41.3), unchanged: restores the sidebar scroll position.
// @ts-nocheck
(() => {
  const scroller = document.getElementById('starlight__sidebar');
  if (!window._starlightScrollRestore || !scroller) return;
  scroller.scrollTop = window._starlightScrollRestore;
  delete window._starlightScrollRestore;
})();
