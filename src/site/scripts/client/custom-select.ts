// Ported from src/frontend/src/components/CustomSelect.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
type CustomSelectRoot = HTMLElement & {
  syncCustomSelect?: () => void;
  closeCustomSelect?: () => void;
};

const openEventName = 'aspire:custom-select-open';
const syncEventName = 'aspire:custom-select-sync';
// Pixels of slop allowed when comparing the live window scroll offset against
// the offset captured when the menu opened. Absorbs sub-pixel rounding on
// high-DPI mobile viewports so a settled, stale open-time scroll is treated as
// "no movement". See handleWindowScroll.
const scrollSettleTolerancePx = 2;

function initializeCustomSelects() {
  document.querySelectorAll<CustomSelectRoot>('[data-custom-select]').forEach((root) => {
    if (root.dataset.customSelectInitialized === 'true') return;

    const nativeSelect = root.querySelector<HTMLSelectElement>('[data-custom-select-native]');
    const trigger = root.querySelector<HTMLButtonElement>('[data-custom-select-trigger]');
    const value = root.querySelector<HTMLElement>('[data-custom-select-value]');
    const listbox = root.querySelector<HTMLElement>('[data-custom-select-listbox]');
    const options = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[data-custom-select-option]')
    );
    if (!nativeSelect || !trigger || !value || !listbox || options.length === 0) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let activeIndex = Math.max(
      0,
      options.findIndex((option) => option.dataset.value === nativeSelect.value)
    );
    let typeahead = '';
    let typeaheadTimer = 0;
    // Scroll offset captured when the menu opens, used to distinguish a real
    // page scroll (dismiss) from a stale scroll event still in flight from the
    // gesture that opened the menu (keep open). See handleWindowScroll below.
    let openScrollX = 0;
    let openScrollY = 0;

    const isOpen = () => root.hasAttribute('data-open');

    function setActive(index: number, scroll = true) {
      const nextIndex = Math.min(Math.max(index, 0), options.length - 1);
      const option = options[nextIndex];
      if (!option || option.disabled) return;

      activeIndex = nextIndex;
      options.forEach((candidate, candidateIndex) => {
        candidate.toggleAttribute('data-active', candidateIndex === activeIndex);
      });
      trigger.setAttribute('aria-activedescendant', option.id);
      if (scroll && isOpen()) option.scrollIntoView({ block: 'nearest' });
    }

    function syncFromNative() {
      const selectedIndex = options.findIndex(
        (option) => option.dataset.value === nativeSelect.value
      );
      const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
      const selected = options[nextIndex];
      if (!selected) return;

      value.textContent =
        selected.querySelector('.custom-select-option-label')?.textContent ?? '';
      options.forEach((option, optionIndex) => {
        option.setAttribute('aria-selected', String(optionIndex === nextIndex));
      });
      setActive(nextIndex, false);
    }

    function positionListbox() {
      const triggerRect = trigger.getBoundingClientRect();
      const viewportMargin = 8;
      const gap = 8;
      const availableWidth = Math.max(0, window.innerWidth - viewportMargin * 2);
      const contentWidth =
        root.dataset.menuWidth === 'content'
          ? Math.max(triggerRect.width, Math.min(320, availableWidth))
          : triggerRect.width;
      const menuWidth = Math.min(contentWidth, availableWidth);
      const maxHeight = Math.min(320, Math.max(160, window.innerHeight - viewportMargin * 2));

      listbox.style.width = `${menuWidth}px`;
      listbox.style.maxHeight = `${maxHeight}px`;

      const menuHeight = Math.min(listbox.scrollHeight, maxHeight);
      const spaceAbove = triggerRect.top - viewportMargin - gap;
      const spaceBelow = window.innerHeight - triggerRect.bottom - viewportMargin - gap;
      const requestedPlacement = root.dataset.placement ?? 'auto';
      const opensUp =
        requestedPlacement === 'up' ||
        (requestedPlacement === 'auto' &&
          spaceBelow < Math.min(menuHeight, 180) &&
          spaceAbove > spaceBelow);
      const left = Math.min(
        Math.max(viewportMargin, triggerRect.left),
        window.innerWidth - menuWidth - viewportMargin
      );
      const top = opensUp
        ? Math.max(viewportMargin, triggerRect.top - menuHeight - gap)
        : Math.min(window.innerHeight - menuHeight - viewportMargin, triggerRect.bottom + gap);

      listbox.dataset.side = opensUp ? 'top' : 'bottom';
      listbox.style.left = `${left}px`;
      listbox.style.top = `${top}px`;
    }

    function close({ restoreFocus = false } = {}) {
      if (!isOpen()) return;

      if (typeof listbox.hidePopover === 'function' && listbox.matches(':popover-open')) {
        listbox.hidePopover();
      }
      listbox.hidden = true;
      root.removeAttribute('data-open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
      if (restoreFocus) trigger.focus();
    }

    function open() {
      if (isOpen()) return;

      openScrollX = window.scrollX;
      openScrollY = window.scrollY;
      document.dispatchEvent(new CustomEvent(openEventName, { detail: root }));
      listbox.hidden = false;
      if (typeof listbox.showPopover === 'function') {
        listbox.showPopover();
      }
      root.setAttribute('data-open', '');
      trigger.setAttribute('aria-expanded', 'true');
      syncFromNative();
      positionListbox();
      setActive(activeIndex);

      if (!reducedMotion.matches) {
        const offset = listbox.dataset.side === 'top' ? 6 : -6;
        listbox.animate(
          [
            { opacity: 0, transform: `translateY(${offset}px) scale(0.985)` },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
          { duration: 160, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        );
      }
    }

    function selectOption(index: number) {
      const option = options[index];
      const nextValue = option?.dataset.value;
      if (!option || option.disabled || !nextValue) return;

      nativeSelect.value = nextValue;
      syncFromNative();
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      close({ restoreFocus: true });
    }

    function moveActive(direction: 1 | -1) {
      let nextIndex = activeIndex;
      do {
        nextIndex = (nextIndex + direction + options.length) % options.length;
      } while (options[nextIndex]?.disabled && nextIndex !== activeIndex);
      setActive(nextIndex);
    }

    function handleTypeahead(key: string) {
      window.clearTimeout(typeaheadTimer);
      typeahead += key.toLocaleLowerCase();
      typeaheadTimer = window.setTimeout(() => {
        typeahead = '';
        typeaheadTimer = 0;
      }, 500);

      const startIndex = activeIndex + 1;
      const orderedOptions = [...options.slice(startIndex), ...options.slice(0, startIndex)];
      const match = orderedOptions.find(
        (option) =>
          !option.disabled &&
          option
            .querySelector('.custom-select-option-label')
            ?.textContent?.trim()
            .toLocaleLowerCase()
            .startsWith(typeahead)
      );
      const matchIndex = match ? options.indexOf(match) : -1;
      if (matchIndex >= 0) {
        if (!isOpen()) open();
        setActive(matchIndex);
      }
    }

    const handleTriggerClick = () => (isOpen() ? close() : open());
    const handleTriggerKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen()) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'Tab') {
        close();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (isOpen()) selectOption(activeIndex);
        else open();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!isOpen()) open();
        else moveActive(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        if (!isOpen()) open();
        const ordered = event.key === 'Home' ? options : [...options].reverse();
        const option = ordered.find((candidate) => !candidate.disabled);
        if (option) setActive(options.indexOf(option));
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        handleTypeahead(event.key);
      }
    };
    const handleDocumentPointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        isOpen() &&
        target instanceof Node &&
        !root.contains(target) &&
        !listbox.contains(target)
      ) {
        close();
      }
    };
    const handleOtherSelect = (event: Event) => {
      if (event instanceof CustomEvent && event.detail !== root) close();
    };
    const handleViewportResize = () => close();
    const handleWindowScroll = (event: Event) => {
      // Scrolling should dismiss the menu so the fixed listbox never detaches
      // from its trigger, but some scrolls must NOT close it:
      //   1. Scrolls that originate *inside* the fixed, overflowing listbox
      //      (wheel/touch, or option.scrollIntoView() during keyboard nav). A
      //      capture-phase window listener also fires for those.
      //   2. A stale page scroll still in flight from the gesture that
      //      revealed and opened the control. Tapping the footer selector
      //      scrolls it into view first; on small touch viewports that scroll
      //      event can be delivered a frame later — after open() — even though
      //      the page has already settled. Such stale events report the same
      //      offset we captured when opening, so only dismiss once the page
      //      actually moves underneath the menu (with a couple of pixels of
      //      slop to absorb sub-pixel rounding on high-DPI mobile viewports).
      //
      // The stale-offset guard only makes sense for page/document scrolls,
      // whose position window.scrollX/Y actually tracks. An ancestor *element*
      // scrolling (e.g. a modal body) leaves window.scrollX/Y unchanged yet
      // still slides the trigger out from under the fixed listbox, so those
      // must always close.
      const target = event.target;
      if (target instanceof Node && listbox.contains(target)) return;
      const isPageScroll =
        target === document ||
        target === window ||
        target === document.scrollingElement ||
        target === document.documentElement ||
        target === document.body;
      if (
        isPageScroll &&
        Math.abs(window.scrollX - openScrollX) <= scrollSettleTolerancePx &&
        Math.abs(window.scrollY - openScrollY) <= scrollSettleTolerancePx
      ) {
        return;
      }
      close();
    };
    const handleSync = () => syncFromNative();
    const handleBeforeSwap = () => {
      window.clearTimeout(typeaheadTimer);
      trigger.removeEventListener('click', handleTriggerClick);
      trigger.removeEventListener('keydown', handleTriggerKeydown);
      nativeSelect.removeEventListener('change', handleSync);
      nativeSelect.removeEventListener(syncEventName, handleSync);
      document.removeEventListener('pointerdown', handleDocumentPointer);
      document.removeEventListener(openEventName, handleOtherSelect);
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('scroll', handleWindowScroll, true);
      close();
      delete root.dataset.customSelectInitialized;
      delete root.syncCustomSelect;
      delete root.closeCustomSelect;
    };

    options.forEach((option, index) => {
      option.addEventListener('pointermove', () => setActive(index, false));
      option.addEventListener('click', () => selectOption(index));
    });
    trigger.addEventListener('click', handleTriggerClick);
    trigger.addEventListener('keydown', handleTriggerKeydown);
    nativeSelect.addEventListener('change', handleSync);
    nativeSelect.addEventListener(syncEventName, handleSync);
    document.addEventListener('pointerdown', handleDocumentPointer);
    document.addEventListener(openEventName, handleOtherSelect);
    window.addEventListener('resize', handleViewportResize, { passive: true });
    window.addEventListener('scroll', handleWindowScroll, { passive: true, capture: true });

    root.syncCustomSelect = syncFromNative;
    root.closeCustomSelect = close;
    root.dataset.customSelectInitialized = 'true';
    syncFromNative();
  });
}

initializeCustomSelects();
export {};
