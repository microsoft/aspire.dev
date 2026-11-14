// Ported from src/frontend/src/components/starlight/PageTitle.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
function initPageTitle() {
  const actions = document.querySelector('.actions-container');
  if (actions) {
    actions.setAttribute('data-tour-target', 'page-actions');
    actions.setAttribute('data-tour-step', 'page-actions');
  }

  const h1 = document.querySelector('main h1#_top');
  if (!h1) return;

  const currentPath = window.location.pathname.replace(/\/$/, '').replace(/^\//, '');
  h1.classList.toggle('api-page-title', currentPath.startsWith('reference/api/'));
}

initPageTitle();
export {};
