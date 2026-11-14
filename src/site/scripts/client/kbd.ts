// Ported from src/frontend/node_modules/starlight-kbd/components/KbdPicker.astro (<script>), M3 of docs/douze-migration-plan.md.
// The provider (window.StarlightKbdProvider) and <starlight-kbd-restore> are inline/kbd.ts.
declare const StarlightKbdProvider: { updateKbdPickers(type: string | null | false): void };

if (!customElements.get('starlight-kbd-picker')) customElements.define(
  'starlight-kbd-picker',
  class StarlightKbdSelect extends HTMLElement {
    constructor() {
      super()

      this.querySelector('select')?.addEventListener('change', (event) => {
        if (!(event.currentTarget instanceof HTMLSelectElement)) return

        StarlightKbdProvider.updateKbdPickers(event.currentTarget.value)

        for (const kbd of document.querySelectorAll('[data-sl-kbd-type]')) {
          if (kbd.getAttribute('data-sl-kbd-type') === event.currentTarget.value) {
            kbd.setAttribute('data-sl-kbd-active', '')
          } else {
            kbd.removeAttribute('data-sl-kbd-active')
          }
        }

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('sl-kbd-type', event.currentTarget.value)
        }
      })
    }
  },
)
export {};
