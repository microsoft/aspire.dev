import type { AsyncIconLoader } from 'mermaid';
import { iconPacks } from '../../config/icon-packs.mjs';

type Mermaid = (typeof import('mermaid'))['default'];
type Theme = 'default' | 'dark';
let library: Promise<Mermaid> | undefined;
let body: HTMLElement | undefined;
let theme: Theme = 'default';
let generation = 0;
let nextId = 0;
let pending = false;
let running = false;
const renderedThemes = new WeakMap<HTMLElement, string>();
const readTheme = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';

function loadMermaid() {
  return (library ??= import('mermaid')
    .then(({ default: mermaid }) => {
      mermaid.registerIconPacks(
        iconPacks.map(({ name, url }): AsyncIconLoader => ({
          name,
          loader: async () => {
            const response = await fetch(url);
            if (!response.ok)
              throw new Error(`Unable to load ${name} icons: HTTP ${response.status}`);
            return response.json() as ReturnType<AsyncIconLoader['loader']>;
          },
        }))
      );
      return mermaid;
    })
    .catch((error: unknown) => {
      library = undefined;
      throw error;
    }));
}

function showError(diagram: HTMLElement, error: unknown) {
  diagram.textContent = `Unable to render diagram: ${error instanceof Error ? error.message : String(error)}`;
  diagram.classList.add('mermaid-error');
  diagram.dataset.processed = 'true';
}

async function renderPage(page: HTMLElement, selectedTheme: Theme, revision: number) {
  const current = () =>
    body === page &&
    document.body === page &&
    generation === revision &&
    readTheme() === selectedTheme;
  const owns = (diagram: HTMLElement) => current() && diagram.isConnected && page.contains(diagram);
  const diagrams = [...page.querySelectorAll<HTMLElement>('pre.mermaid')].filter(
    (diagram) => renderedThemes.get(diagram) !== selectedTheme
  );
  if (!diagrams.length) return;
  for (const diagram of diagrams) diagram.dataset.diagram ??= diagram.textContent ?? '';

  let mermaid: Mermaid;
  try {
    mermaid = await loadMermaid();
    if (!current()) return;
    mermaid.initialize({ startOnLoad: false, theme: selectedTheme });
  } catch (error) {
    console.error('[mermaid] Initialization failed:', error);
    for (const diagram of diagrams) if (owns(diagram)) showError(diagram, error);
    return;
  }

  for (const diagram of diagrams) {
    if (!current()) break;
    if (!owns(diagram)) continue;
    const id = `aspire-mermaid-${++nextId}`;
    try {
      const { svg } = await mermaid.render(id, diagram.dataset.diagram!);
      if (!owns(diagram)) continue;
      diagram.innerHTML = svg;
      diagram.classList.remove('mermaid-error');
      diagram.dataset.processed = 'true';
      renderedThemes.set(diagram, selectedTheme);
    } catch (error) {
      console.error('[mermaid] Rendering failed:', error);
      if (!owns(diagram)) continue;
      showError(diagram, error);
      renderedThemes.set(diagram, selectedTheme);
    } finally {
      document.getElementById(`d${id}`)?.remove();
      document.getElementById(`i${id}`)?.remove();
    }
  }
}

function schedule() {
  if (!body) return;
  const selectedTheme = readTheme();
  if (selectedTheme !== theme) {
    theme = selectedTheme;
    generation++;
  }
  pending = true;
  if (running) return;
  running = true;
  // Serialize Mermaid's global configuration and rendering, including theme changes.
  queueMicrotask(() => {
    void (async () => {
      try {
        while (pending && body) {
          pending = false;
          await renderPage(body, theme, generation);
        }
      } finally {
        running = false;
      }
    })();
  });
}

const observer = new MutationObserver(() => {
  if (readTheme() !== theme) schedule();
});
document.addEventListener('astro:before-swap', () => {
  generation++;
  body = undefined;
  pending = false;
  observer.disconnect();
});
document.addEventListener('astro:page-load', () => {
  if (body !== document.body) {
    body = document.body;
    generation++;
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }
  schedule();
});
