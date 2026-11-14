// Inline (pre-paint) head script: starlight-kbd's KbdProvider.astro is:inline script (defines
// window.StarlightKbdProvider) and Kbd.astro's is:inline script (defines <starlight-kbd-restore>, rendered
// inside each <starlight-kbd> so the reader's keyboard type shows before the first paint). Unchanged.
// @ts-nocheck
window.StarlightKbdProvider = (() => {
  const detectorRegexs = { apple: /mac|ipad|iphone/i, linux: /linux/i, windows: /win/i }
  return {
    matchedType: null,
    updateKbdPickers(type) {
      for (const select of document.querySelectorAll('starlight-kbd-picker select')) {
        let detectors = {}
        let isKnownType = false
        for (const option of Array.from(select.options)) {
          if (option.value === type) isKnownType = true
          const detector = option.dataset['detector']
          if (detector) detectors[detector] = option.value
        }
        if (isKnownType) {
          select.value = type
          continue
        } else if (this.matchedType) {
          select.value = this.matchedType
          continue
        }
        const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent
        for (const [detector, type] of Object.entries(detectors)) {
          const detectorRegex = detectorRegexs[detector]
          if (!detectorRegex) continue
          if (detectorRegex.test(platform)) {
            this.matchedType = type
            select.value = type
            break
          }
        }
      }
    },
  }
})()

if (!customElements.get('starlight-kbd-restore')) {
customElements.define(
    'starlight-kbd-restore',
    class StarlightKbdRestore extends HTMLElement {
      connectedCallback() {
        const kbd = this.closest('starlight-kbd')
        if (!(kbd instanceof HTMLElement) || typeof localStorage === 'undefined') return
        const type =
          (typeof localStorage !== 'undefined' && localStorage.getItem('sl-kbd-type')) ??
          StarlightKbdProvider.matchedType
        if (!type) return
        for (const kbd of document.querySelectorAll('[data-sl-kbd-type]')) {
          if (kbd.getAttribute('data-sl-kbd-type') === type) {
            kbd.setAttribute('data-sl-kbd-active', '')
          } else {
            kbd.removeAttribute('data-sl-kbd-active')
          }
        }
      }
    },
)
}
