// Ported from src/frontend/src/components/FooterPreferences.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
import { getStoredPreference, setStoredPreference } from '@utils/browser-storage';
import { getLanguageSwitchPath, getSelectedLocaleForPath } from '@utils/language-switch';
import {
  normalizeLocale,
  DEFAULT_LOCALE,
  PREFERRED_LOCALE_STORAGE_KEY,
  appendSearchAndHash,
} from '@utils/locale-routes';

function initFooterPreferences() {
  const themeToggle = document.getElementById('footer-theme-toggle') as HTMLElement | null;
  const themeButtons = Array.from(
    themeToggle?.querySelectorAll<HTMLButtonElement>('[data-theme-option]') ?? []
  );
  const languageSelect = document.getElementById('footer-language-select') as HTMLSelectElement;
  const kbdSelect = document.getElementById('footer-kbd-select') as HTMLSelectElement;
  const themeOptions = ['light', 'auto', 'dark'] as const;

  type ThemeOption = (typeof themeOptions)[number];

  function isThemeOption(value: string | null | undefined): value is ThemeOption {
    return value === 'light' || value === 'auto' || value === 'dark';
  }

  function getLanguageOptionValue(locale: string): string {
    const option = Array.from(languageSelect?.options ?? []).find(
      (candidate) => candidate.value.toLowerCase() === locale.toLowerCase()
    );

    return option?.value ?? locale;
  }

  if (themeToggle && themeButtons.length > 0) {
    function updateThemeToggle(theme: ThemeOption) {
      themeToggle.dataset.themeChoice = theme;

      for (const button of themeButtons) {
        const isSelected = button.dataset.themeOption === theme;
        button.setAttribute('aria-checked', String(isSelected));
        button.tabIndex = isSelected ? 0 : -1;
      }
    }

    function applyTheme(theme: ThemeOption) {
      // Use Starlight's theme system
      setStoredPreference('starlight-theme', theme);

      // Apply theme immediately
      const root = document.documentElement;
      if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.dataset.theme = prefersDark ? 'dark' : 'light';
      } else {
        root.dataset.theme = theme;
      }

      updateThemeToggle(theme);

      // Sync with Starlight's header theme select if present
      const headerThemeSelect = document.querySelector<HTMLSelectElement>(
        'starlight-theme-select select'
      );
      if (headerThemeSelect) {
        headerThemeSelect.value = theme;
      }
    }

    // Get current theme from Starlight's storage
    const storedTheme = getStoredPreference('starlight-theme');
    updateThemeToggle(isThemeOption(storedTheme) ? storedTheme : 'auto');

    for (const button of themeButtons) {
      button.addEventListener('click', () => {
        const theme = button.dataset.themeOption;

        if (isThemeOption(theme)) {
          applyTheme(theme);
        }
      });
    }

    themeToggle.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        return;
      }

      e.preventDefault();

      const currentTheme = isThemeOption(themeToggle.dataset.themeChoice)
        ? themeToggle.dataset.themeChoice
        : 'auto';
      const currentIndex = themeOptions.indexOf(currentTheme);
      const nextIndex =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? themeOptions.length - 1
            : e.key === 'ArrowLeft'
              ? (currentIndex - 1 + themeOptions.length) % themeOptions.length
              : (currentIndex + 1) % themeOptions.length;
      const nextTheme = themeOptions[nextIndex];

      applyTheme(nextTheme);

      const nextButton = themeButtons.find((button) => button.dataset.themeOption === nextTheme);
      nextButton?.focus();
    });
  }

  if (languageSelect) {
    // Get current language from URL
    const currentPath = window.location.pathname;
    const storedPreferredLocale = normalizeLocale(
      getStoredPreference(PREFERRED_LOCALE_STORAGE_KEY)
    );
    const currentLang = getSelectedLocaleForPath(currentPath, storedPreferredLocale);
    languageSelect.value = getLanguageOptionValue(currentLang);
    languageSelect.dispatchEvent(new Event('aspire:custom-select-sync'));

    languageSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const newLang = normalizeLocale(target.value) ?? DEFAULT_LOCALE;
      const currentPath = window.location.pathname;
      setStoredPreference(PREFERRED_LOCALE_STORAGE_KEY, newLang);
      const newPath = getLanguageSwitchPath(currentPath, newLang);

      window.location.href = appendSearchAndHash(
        newPath,
        window.location.search,
        window.location.hash
      );
    });
  }

  if (kbdSelect) {
    // Get stored keyboard type from starlight-kbd's storage
    const storedKbd = getStoredPreference('sl-kbd-type');

    // Auto-detect OS if no stored preference
    if (!storedKbd && typeof navigator !== 'undefined') {
      const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';
      const userAgent = navigator.userAgent || '';

      let detectedType = 'windows'; // default
      if (/Mac|iPhone|iPad|iPod/i.test(platform) || /Mac|iPhone|iPad|iPod/i.test(userAgent)) {
        detectedType = 'mac';
      } else if (/Linux/i.test(platform) || /Linux/i.test(userAgent)) {
        detectedType = 'linux';
      }

      kbdSelect.value = detectedType;
      setStoredPreference('sl-kbd-type', detectedType);
    } else if (storedKbd) {
      kbdSelect.value = storedKbd;
    }
    kbdSelect.dispatchEvent(new Event('aspire:custom-select-sync'));

    kbdSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const kbdType = target.value;

      // Save to localStorage (using starlight-kbd's key)
      setStoredPreference('sl-kbd-type', kbdType);

      // Update all kbd elements on the page
      for (const kbd of document.querySelectorAll('[data-sl-kbd-type]')) {
        if (kbd.getAttribute('data-sl-kbd-type') === kbdType) {
          kbd.setAttribute('data-sl-kbd-active', '');
        } else {
          kbd.removeAttribute('data-sl-kbd-active');
        }
      }

      // Sync with any other kbd pickers on the page
      if (typeof (window as any).StarlightKbdProvider !== 'undefined') {
        (window as any).StarlightKbdProvider.updateKbdPickers(kbdType);
      }
    });
  }
}

// Initialize on page load
initFooterPreferences();

