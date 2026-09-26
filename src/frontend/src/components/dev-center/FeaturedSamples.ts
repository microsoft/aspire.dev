import { createFilterHistory } from './filter-history';

class FeaturedSamples extends HTMLElement {
  private controller?: AbortController;

  connectedCallback() {
    this.controller?.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;
    const checkboxes = [...this.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    const cards = [...this.querySelectorAll<HTMLElement>('[data-sample-languages]')];
    const clearButtons = [...this.querySelectorAll<HTMLButtonElement>('[data-clear-sample-language]')];
    const allSamples = this.querySelector<HTMLAnchorElement>('[data-all-samples]')!;
    const count = this.querySelector<HTMLElement>('[data-sample-count]')!;
    const empty = this.querySelector<HTMLElement>('[data-sample-empty]')!;
    const parameter = 'sample-language';
    const update = () => {
      const selected = checkboxes.filter((checkbox) => checkbox.checked);
      const languages = selected.map((checkbox) => checkbox.value);
      let visible = 0;
      for (const card of cards) {
        card.hidden = languages.length > 0 && !languages.some((language) => card.dataset.sampleLanguages!.split(' ').includes(language));
        if (!card.hidden) visible++;
      }
      const labels = selected.map((checkbox) => checkbox.labels![0].textContent.trim()).join(', ');
      count.textContent = languages.length
        ? `${visible} of ${cards.length} featured samples: ${labels}`
        : `${cards.length} featured samples: All languages`;
      empty.hidden = visible > 0;
      empty.querySelector('h3')!.textContent = languages.length ? `No featured samples for ${labels}` : 'No featured samples';
      clearButtons[0].hidden = languages.length === 0 || visible === 0;
      const browse = new URL(allSamples.href);
      browse.searchParams.delete('language');
      for (const language of languages) browse.searchParams.append('language', language);
      allSamples.href = `${browse.pathname}${browse.search}`;
    };
    const save = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete(parameter);
      for (const checkbox of checkboxes) {
        if (checkbox.checked) url.searchParams.append(parameter, checkbox.value);
      }
      void historySync.write(url, false);
    };
    const restore = () => {
      const languages = new Set(new URLSearchParams(window.location.search).getAll(parameter));
      for (const checkbox of checkboxes) checkbox.checked = languages.has(checkbox.value);
      update();
    };
    const historySync = createFilterHistory(this, [parameter], restore, signal);
    for (const checkbox of checkboxes) {
      checkbox.addEventListener('change', () => { update(); save(); }, { signal });
    }
    for (const button of clearButtons) {
      button.addEventListener('click', () => {
        for (const checkbox of checkboxes) checkbox.checked = false;
        update();
        save();
        checkboxes[0].focus();
      }, { signal });
    }
    this.querySelector<HTMLElement>('.sample-filter')!.hidden = false;
    historySync.initialize();
    this.setAttribute('data-ready', '');
  }

  disconnectedCallback() {
    this.controller?.abort();
  }
}

if (!customElements.get('featured-samples')) customElements.define('featured-samples', FeaturedSamples);
