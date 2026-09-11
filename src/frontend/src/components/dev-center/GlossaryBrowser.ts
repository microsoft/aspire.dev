import { matchesGlossaryQuery } from '../../utils/dev-center/glossary';
import { topics } from '../../utils/dev-center/topics';

class GlossaryBrowser extends HTMLElement {
  private controller?: AbortController;

  connectedCallback() {
    this.controller?.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;
    const form = this.querySelector<HTMLFormElement>('form')!;
    const query = this.querySelector<HTMLInputElement>('#glossary-search-input')!;
    const topicButtons = [...this.querySelectorAll<HTMLButtonElement>('[data-kind]')].map((button) => ({
      button,
      topic: topics.find((topic) => topic.title === button.dataset.kind)!,
    }));
    const selectedTopics = new Set<string>();
    const clearSearch = this.querySelector<HTMLButtonElement>('#glossary-search-clear')!;
    const clearFilters = this.querySelector<HTMLButtonElement>('#glossary-clear-filters')!;
    const cards = [...this.querySelectorAll<HTMLElement>('[data-glossary-card]')];
    const letters = [...this.querySelectorAll<HTMLAnchorElement>('[data-letter-filter]')];
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    let letter = '';

    const close = (card: HTMLElement) => {
      clearTimeout(timers.get(card));
      timers.delete(card);
      card.dataset.preview = 'false';
      delete card.dataset.pinned;
      card.querySelector('[data-glossary-context]')!.setAttribute('aria-expanded', 'false');
      card.querySelector('[data-definition]')!.removeAttribute('aria-hidden');
      const panel = card.querySelector<HTMLElement>('[data-context-panel]')!;
      panel.setAttribute('aria-hidden', 'true');
      panel.inert = true;
      card.querySelector('[data-context-label]')!.textContent = 'In practice';
    };
    const closeAll = () => cards.forEach(close);
    const update = () => {
      closeAll();
      let count = 0;
      for (const card of cards) {
        card.hidden = !matchesGlossaryQuery(card.dataset.search ?? '', query.value)
          || Boolean(letter && card.dataset.letter !== letter)
          || (selectedTopics.size > 0 && !card.dataset.topics?.split(' ').some((topic) => selectedTopics.has(topic)));
        if (!card.hidden) count++;
      }
      this.querySelectorAll<HTMLElement>('[data-glossary-group]').forEach((group) => {
        group.hidden = !group.querySelector('[data-glossary-card]:not([hidden])');
      });
      letters.forEach((link) => {
        if (link.dataset.letterFilter === letter) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
      for (const { button, topic } of topicButtons) {
        const selected = selectedTopics.has(topic.id);
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('active', selected);
      }
      const filters = [query.value.trim(), ...topicButtons.filter(({ topic }) => selectedTopics.has(topic.id)).map(({ topic }) => topic.title), letter && `letter ${letter}`].filter(Boolean);
      const summary = `${count} of ${cards.length} terms${filters.length ? `: ${filters.join(', ')}` : ''}`;
      this.querySelector('#glossary-search-count')!.textContent = filters.length ? `${count} of ${cards.length} terms` : `${cards.length} terms`;
      this.querySelector('#glossary-search-status')!.textContent = summary;
      clearSearch.style.display = query.value ? 'flex' : 'none';
      clearFilters.style.display = filters.length && count > 0 ? 'inline-block' : 'none';
      this.querySelector<HTMLElement>('[data-glossary-empty]')!.hidden = count > 0;
    };
    const save = (replace: boolean) => {
      const url = new URL(window.location.href);
      for (const name of ['q', 'topic', 'letter']) url.searchParams.delete(name);
      if (query.value.trim()) url.searchParams.set('q', query.value.trim());
      for (const { topic } of topicButtons) {
        if (selectedTopics.has(topic.id)) url.searchParams.append('topic', topic.id);
      }
      if (letter) url.searchParams.set('letter', letter);
      url.hash = '';
      if (replace) window.history.replaceState(null, '', url);
      else if (url.href !== window.location.href) window.history.pushState(null, '', url);
      const returnTo = `${url.pathname}${url.search}`;
      this.querySelectorAll<HTMLAnchorElement>('[data-term-link]').forEach((link) => {
        const target = new URL(link.href);
        if (url.search) target.searchParams.set('from', returnTo);
        else target.searchParams.delete('from');
        link.href = target.href;
      });
    };
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      query.value = params.get('q') ?? '';
      selectedTopics.clear();
      for (const requestedTopic of params.getAll('topic')) {
        if (topicButtons.some(({ topic }) => topic.id === requestedTopic)) selectedTopics.add(requestedTopic);
      }
      const requestedLetter = (params.get('letter') ?? '').toUpperCase();
      letter = letters.some((link) => link.dataset.letterFilter === requestedLetter) ? requestedLetter : '';
      update();
      // Restore filtered return links without rewriting the user's history entry.
      const returnTo = `${window.location.pathname}${window.location.search}`;
      this.querySelectorAll<HTMLAnchorElement>('[data-term-link]').forEach((link) => {
        const target = new URL(link.href);
        if (window.location.search) target.searchParams.set('from', returnTo);
        else target.searchParams.delete('from');
        link.href = target.href;
      });
    };
    const clear = () => {
      query.value = '';
      selectedTopics.clear();
      letter = '';
      update();
      save(false);
    };
    form.hidden = false;
    form.addEventListener('submit', (event) => { event.preventDefault(); update(); save(false); }, { signal });
    form.addEventListener('reset', (event) => { event.preventDefault(); clear(); }, { signal });
    query.addEventListener('input', () => { update(); save(true); }, { signal });
    clearSearch.addEventListener('click', () => { query.value = ''; update(); save(true); query.focus(); }, { signal });
    clearFilters.addEventListener('click', () => { clear(); query.focus(); }, { signal });
    for (const { button, topic } of topicButtons) {
      button.addEventListener('click', () => {
        if (selectedTopics.has(topic.id)) selectedTopics.delete(topic.id);
        else selectedTopics.add(topic.id);
        update();
        save(false);
      }, { signal });
    }
    this.querySelector('[data-clear-glossary]')!.addEventListener('click', () => { clear(); query.focus(); }, { signal });
    for (const link of letters) {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        letter = link.dataset.letterFilter ?? '';
        update();
        save(false);
      }, { signal });
    }
    window.addEventListener('popstate', restore, { signal });

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    for (const card of cards) {
      const button = card.querySelector<HTMLButtonElement>('[data-glossary-context]')!;
      const preview = () => {
        cards.forEach((other) => { if (other !== card) close(other); });
        card.dataset.preview = 'true';
        button.setAttribute('aria-expanded', 'true');
        card.querySelector('[data-definition]')!.setAttribute('aria-hidden', 'true');
        const panel = card.querySelector<HTMLElement>('[data-context-panel]')!;
        panel.removeAttribute('aria-hidden');
        panel.inert = false;
      };
      card.addEventListener('pointerenter', () => {
        if (finePointer.matches) timers.set(card, setTimeout(preview, 180));
      }, { signal });
      card.addEventListener('pointerleave', () => {
        clearTimeout(timers.get(card));
        timers.delete(card);
        if (!card.dataset.pinned && !card.contains(document.activeElement)) close(card);
      }, { signal });
      button.addEventListener('focus', () => { if (finePointer.matches) preview(); }, { signal });
      card.addEventListener('focusout', (event) => {
        if (!card.dataset.pinned && !card.contains(event.relatedTarget as Node | null)) close(card);
      }, { signal });
      button.addEventListener('click', () => {
        clearTimeout(timers.get(card));
        if (card.dataset.pinned) close(card);
        else {
          preview();
          card.dataset.pinned = 'true';
          card.querySelector('[data-context-label]')!.textContent = 'Show definition';
        }
      }, { signal });
    }
    document.addEventListener('pointerdown', (event) => {
      cards.forEach((card) => { if (!card.contains(event.target as Node)) close(card); });
    }, { signal });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeAll();
      }
    }, { signal });
    signal.addEventListener('abort', () => timers.forEach(clearTimeout), { once: true });
    restore();
  }

  disconnectedCallback() {
    this.controller?.abort();
  }
}

if (!customElements.get('glossary-browser')) customElements.define('glossary-browser', GlossaryBrowser);
