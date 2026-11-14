// Ported from src/frontend/src/components/InstallCliModal.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
const QUALITY_STORAGE_KEY = 'aspire-install-channel';

function updateVersionDisplay(quality: 'release' | 'staging' | 'dev') {
  const modal = document.getElementById('install-cli-modal');
  if (!modal) return;

  // Toggle visibility of code blocks and quality notes
  modal.querySelectorAll<HTMLElement>('.code-wrapper, .quality-aside').forEach((element) => {
    const version = element.getAttribute('data-version') || element.getAttribute('data-quality');
    element.style.display = version === quality ? 'block' : 'none';
  });
  modal.querySelectorAll<HTMLElement>('.release-info').forEach((element) => {
    element.hidden = element.getAttribute('data-quality') !== quality;
  });

  // Save to localStorage
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, quality);
  } catch {
    // Ignore localStorage errors (private browsing, etc.)
  }
}

function getStoredQuality(): 'release' | 'staging' | 'dev' {
  try {
    const stored = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (stored === 'release' || stored === 'staging' || stored === 'dev') {
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }
  return 'release';
}

let modalListeners: AbortController | undefined;

function initializeModal() {
  modalListeners?.abort();
  modalListeners = undefined;
  const modal = document.getElementById('install-cli-modal') as HTMLDialogElement;
  if (!modal) return;
  modalListeners = new AbortController();
  const { signal } = modalListeners;

  const versionSelect = modal.querySelector('#version-select') as HTMLSelectElement;
  const openBtns = document.querySelectorAll<HTMLElement>('[data-open-install-modal]');
  const closeBtn = modal.querySelector('[data-close-modal]');

  const openModal = (openBtn: HTMLElement) => {
    // On mobile (under 50em/800px), or if mobile menu is open, redirect to the full page
    // Modal can't compete with mobile sidebar's z-index
    const mobileMenuBtn = document.querySelector('starlight-menu-button button');
    const mobileMenuOpen = mobileMenuBtn?.getAttribute('aria-expanded') === 'true';
    if (window.innerWidth < 800 || mobileMenuOpen) {
      window.location.assign('/get-started/install-cli/');
      return;
    }

    modal.showModal();

    // Position modal below the button on larger screens
    const btnRect = openBtn.getBoundingClientRect();
    const modalContent = modal.querySelector('.modal-content') as HTMLElement;

    if (modalContent) {
      // Reset any previous positioning
      modalContent.style.position = '';
      modalContent.style.top = '';
      modalContent.style.right = '';

      // Only position absolutely below button on larger screens (72rem/1152px)
      if (window.innerWidth >= 1152) {
        modalContent.style.position = 'absolute';
        modalContent.style.top = `${btnRect.bottom + 8}px`;
        modalContent.style.right = `${window.innerWidth - btnRect.right}px`;
      }
    }

    // Load stored quality or default to release
    if (versionSelect) {
      const storedQuality = getStoredQuality();
      versionSelect.value = storedQuality;
      versionSelect.dispatchEvent(new Event('aspire:custom-select-sync'));
      updateVersionDisplay(storedQuality);
    }
  };

  // Quality selector change handler
  if (versionSelect) {
    versionSelect.addEventListener('change', (e) => {
      const quality = (e.target as HTMLSelectElement).value as 'release' | 'staging' | 'dev';
      updateVersionDisplay(quality);
    }, { signal });
  }

  // Open modal and position it
  openBtns.forEach((openBtn) => {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(openBtn);
    }, { signal });
  });

  // Close modal handlers
  closeBtn?.addEventListener('click', () => modal.close(), { signal });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.close();
  }, { signal });

  // Close on Escape key
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') modal.close();
  }, { signal });

  // Close modal if window is resized below mobile breakpoint
  window.addEventListener('resize', () => {
    if (window.innerWidth < 800 && modal.open) modal.close();
  }, { signal });
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeModal, { once: true });
} else {
  initializeModal();
}

export {};
