// Runs a callback once the document is parsed. Module scripts already run after parsing (readyState
// 'interactive'), so in practice this calls `fn` immediately; it guards inline or early imports.
export function onReady(fn: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => fn(), { once: true });
  } else {
    fn();
  }
}
