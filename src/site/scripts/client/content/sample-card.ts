// Ported from src/frontend/src/components/SampleCard.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  // Read-more toggle with smooth animation
  const btn = target.closest('[data-read-more]') as HTMLButtonElement | null;
  if (btn) {
    const desc = btn.closest('[data-desc]');
    if (!desc) return;
    const rest = desc.querySelector('[data-desc-rest]') as HTMLElement | null;
    if (!rest) return;

    const isExpanded = !rest.hidden;
    rest.hidden = isExpanded;
    btn.textContent = isExpanded ? 'Read more\u2026' : 'Show less';
    return;
  }

  // Clickable tag badges — activate the matching filter chip in the grid.
  // Each badge is wrapped in a <span data-tag-key="..."> so we can match by
  // tag key rather than display text, avoiding locale/whitespace mismatches.
  const badgeWrap = target.closest('[data-tag-key]') as HTMLElement | null;
  if (badgeWrap) {
    const tagKey = badgeWrap.dataset.tagKey;
    if (!tagKey) return;
    const browser = document.querySelector('[data-samples-browser]');
    if (!browser) return;
    const chip = browser.querySelector(`[data-tag="${tagKey}"]`) as HTMLElement | null;
    if (chip) {
      chip.click();
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    return;
  }

  const card = target.closest('[data-sample-detail-href]') as HTMLElement | null;
  if (card && !target.closest('a, button')) {
    const href = card.dataset.sampleDetailHref;
    if (href) {
      window.location.href = href;
    }
  }
});
export {};
