// Ported from src/frontend/src/components/home/HomeAgentBadge.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
export function initHomeAgentBadges(): void {
  function initAgentBadges() {
    document.querySelectorAll<HTMLElement>('[data-home-agent-badge]').forEach((badge) => {
      if (badge.dataset.badgeReady === 'true') return;

      const trigger = badge.querySelector<HTMLButtonElement>('.agent-badge-trigger');
      if (!trigger) return;

      let pinned = false;
      let hovering = false;
      let focusWithin = false;
      let suppressed = false;

      const setOpen = (open: boolean) => {
        badge.dataset.open = String(open);
        trigger.setAttribute('aria-expanded', String(open));
      };

      const syncOpenState = () => {
        setOpen(pinned || (!suppressed && (hovering || focusWithin)));
      };

      const handlePointerEnter = () => {
        hovering = true;
        syncOpenState();
      };
      const handlePointerLeave = () => {
        hovering = false;
        if (!focusWithin) suppressed = false;
        syncOpenState();
      };
      const handleFocusIn = () => {
        focusWithin = true;
        syncOpenState();
      };
      const handleFocusOut = () => {
        queueMicrotask(() => {
          focusWithin = badge.contains(document.activeElement);
          if (!focusWithin) suppressed = false;
          syncOpenState();
        });
      };
      const handleClick = () => {
        if (pinned) {
          pinned = false;
          suppressed = true;
          setOpen(false);
          return;
        }

        pinned = true;
        suppressed = false;
        setOpen(true);
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        pinned = false;
        suppressed = true;
        setOpen(false);
        trigger.focus();
      };
      const handleDocumentPointerDown = (event: PointerEvent) => {
        if (event.target instanceof Node && badge.contains(event.target)) return;
        pinned = false;
        suppressed = false;
        setOpen(false);
      };

      badge.addEventListener('pointerenter', handlePointerEnter);
      badge.addEventListener('pointerleave', handlePointerLeave);
      badge.addEventListener('focusin', handleFocusIn);
      badge.addEventListener('focusout', handleFocusOut);
      trigger.addEventListener('click', handleClick);
      trigger.addEventListener('keydown', handleKeyDown);
      document.addEventListener('pointerdown', handleDocumentPointerDown);

      badge.dataset.badgeReady = 'true';
      setOpen(false);
    });
  }

  initAgentBadges();
}
