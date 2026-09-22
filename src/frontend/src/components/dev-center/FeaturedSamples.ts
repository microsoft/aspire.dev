import { createFilterHistory } from './filter-history';

class FeaturedSamples extends HTMLElement {
  private controller?: AbortController;

  connectedCallback() {
    this.controller?.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;
    const select = this.querySelector<HTMLSelectElement>('select')!;
    const cards = [...this.querySelectorAll<HTMLElement>('[data-sample-languages]')];
    const clearButtons = [...this.querySelectorAll<HTMLButtonElement>('[data-clear-sample-language]')];
    const allSamples = this.querySelector<HTMLAnchorElement>('[data-all-samples]')!;
    const count = this.querySelector<HTMLElement>('[data-sample-count]')!;
    const empty = this.querySelector<HTMLElement>('[data-sample-empty]')!;
    const parameter = 'sample-language';
    const update = () => {
      let visible = 0;
      for (const card of cards) {
        card.hidden = Boolean(select.value) && !card.dataset.sampleLanguages!.split(' ').includes(select.value);
        if (!card.hidden) visible++;
      }
      const language = select.selectedOptions[0].text;
      count.textContent = select.value
        ? `${visible} of ${cards.length} featured samples: ${language}`
        : `${cards.length} featured samples`;
      empty.hidden = visible > 0;
      empty.querySelector('h3')!.textContent = `No featured samples for ${language}`;
      clearButtons[0].hidden = !select.value || visible === 0;
      const browse = new URL(allSamples.href);
      if (select.value) browse.searchParams.set('language', select.value);
      else browse.searchParams.delete('language');
      allSamples.href = `${browse.pathname}${browse.search}`;
    };
    const save = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete(parameter);
      if (select.value) url.searchParams.set(parameter, select.value);
      void historySync.write(url, false);
    };
    const restore = () => {
      const language = new URLSearchParams(window.location.search).get(parameter) ?? '';
      select.value = [...select.options].some((option) => option.value === language) ? language : '';
      update();
    };
    const historySync = createFilterHistory(this, [parameter], restore, signal);
    select.addEventListener('change', () => { update(); save(); }, { signal });
    for (const button of clearButtons) {
      button.addEventListener('click', () => {
        select.value = '';
        update();
        save();
        select.focus();
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
