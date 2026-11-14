// Ported from src/frontend/node_modules/starlight-image-zoom/components/ImageZoom.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// The plugin's rehype step (which wraps every content image in <starlight-image-zoom-zoomable> with a
// zoom button) has no Douze counterpart yet: wrapContentImages() below does the same wrapping on the
// client, over the images of .sl-markdown-content, with the same exclusions (data-zoom-off, .not-content,
// images inside links or buttons).
import { onReady } from './lib/ready'

const STARLIGHT_IMAGE_ZOOM_ZOOMABLE_TAG = 'starlight-image-zoom-zoomable'

function wrapContentImages(): void {
  const candidates = document.querySelectorAll<HTMLElement>('.sl-markdown-content picture, .sl-markdown-content img')
  for (const node of candidates) {
    if (node.tagName === 'IMG' && node.parentElement?.tagName === 'PICTURE') continue
    if (node.closest(STARLIGHT_IMAGE_ZOOM_ZOOMABLE_TAG)) continue
    if (node.hasAttribute('data-zoom-off')) continue
    if (node.parentElement?.closest('.not-content, button, a[href]')) continue
    const img = node.tagName === 'IMG' ? node : node.querySelector('img')
    const alt = (img?.getAttribute('alt') ?? '').trim()
    const wrapper = document.createElement(STARLIGHT_IMAGE_ZOOM_ZOOMABLE_TAG)
    node.replaceWith(wrapper)
    wrapper.append(node)
    const button = document.createElement('button')
    button.setAttribute('aria-label', `Zoom image${alt.length > 0 ? `: ${alt}` : ''}`)
    button.className = 'starlight-image-zoom-control'
    button.innerHTML = '<svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24"><use href="#starlight-image-zoom-icon-zoom"></use></svg>'
    wrapper.append(button)
  }
}

// https://caniuse.com/requestidlecallback
const onIdle = globalThis.requestIdleCallback ?? ((cb) => setTimeout(cb, 1))

/**
 * Based on:
 * - https://github.com/francoischalifour/medium-zoom
 * - https://github.com/rpearce/react-medium-image-zoom
 */
customElements.define(
  'starlight-image-zoom',
  class StarlightImageZoom extends HTMLElement {
    #currentZoom?: CurrentZoom | undefined
    #images: ZoomableElement[] = []
    #previousFocus?: Element | null | undefined
    #template = this.querySelector('template')

    #classList = {
      image: 'starlight-image-zoom-image',
      opened: 'starlight-image-zoom-opened',
      source: 'starlight-image-zoom-source',
      transition: 'starlight-image-zoom-transition',
    }
    #dataZoomTransformKey = 'zoomTransform'


    constructor() {
      super()

      const initialize = () => {
        wrapContentImages()
        onIdle(() => {
          const zoomables = [...document.querySelectorAll(STARLIGHT_IMAGE_ZOOM_ZOOMABLE_TAG)]
          if (zoomables.length === 0) return

          this.#setupZoom(zoomables)
          document.addEventListener('click', this.#onClick)
          window.addEventListener('resize', this.#onResize)
        })
      }
      onReady(initialize)
    }

    #setupZoom(zoomables: Element[]) {
      for (const zoomable of zoomables) {
        const img = zoomable.querySelector<ZoomableElement>(':scope > img, :scope > picture img, :scope > svg')
        if (!img) continue

        this.#images.push(img)

        zoomable.querySelector('button')?.addEventListener('click', (event) => {
          event.stopPropagation()
          this.#open(img)
        })
      }
    }

    #onClick = ({ target }: MouseEvent) => {
      if (target instanceof HTMLElement && target.closest('figcaption')) return

      if (this.#currentZoom) {
        this.#close()
        return
      }

      if (!(target instanceof HTMLImageElement) && !(target instanceof SVGElement)) return

      let zoomTarget: ZoomableElement | undefined

      if (this.#images.includes(target)) {
        zoomTarget = target
      } else if (this.#isSVGElement(target)) {
        const svg = target.closest('svg')
        if (svg && this.#images.includes(svg)) zoomTarget = svg
      }

      if (!zoomTarget) return

      this.#open(zoomTarget)
    }

    #onResize = () => {
      this.#close(true)
    }

    #onWheel = () => {
      this.#close()
    }

    #onCancel = (event: Event) => {
      event.preventDefault()
      this.#close()
    }

    #open(image: ZoomableElement) {
      if (!this.#template || this.#currentZoom) return

      // Save the current focused element to restore it later.
      this.#previousFocus = document.activeElement

      // Portal the dialog.
      const portal = document.createElement('div')
      // The dialog's styles are scoped to the root class: the portal carries it.
      portal.className = 'cid-image-zoom-image-zoom'
      portal.append(this.#template.content.cloneNode(true))

      // Grab a reference to the dialog and the zoomed image figure.
      const dialog = portal.querySelector('dialog')
      const figure = dialog?.querySelector('figure')
      if (!dialog || !figure) return

      // Track some body style properties that will be overridden to prevent layout shifts.
      const body: CurrentZoom['body'] = { overflow: document.body.style.overflow, width: document.body.style.width }

      // Disable body scrolling and override some styles to prevent layout shifts.
      const clientWidth = document.body.clientWidth
      document.body.style.overflow = 'hidden'
      document.body.style.width = `${clientWidth}px`
      document
        .querySelector('header')
        ?.style.setProperty('padding-inline-end', `calc(var(--sl-nav-pad-x) + ${window.innerWidth - clientWidth}px)`)

      // Clone the image and apply a zoom effect to it.
      const zoomedImage = this.#cloneAndZoomImage(image)

      // Apply CSS classes to hide the source image and transition the zoomed image.
      image.classList.add(this.#classList.source)
      zoomedImage.classList.add(this.#classList.image)

      // Append the zoomed image to the dialog.
      figure.append(zoomedImage)

      // Set the caption.
      this.#setCaption(image.getAttribute('alt') || this.#getSVGTitle(image), figure)

      // Render the portaled dialog.
      document.body.append(portal)

      // Open the dialog.
      document.addEventListener('wheel', this.#onWheel, { once: true })
      dialog.addEventListener('cancel', this.#onCancel)
      dialog.showModal()

      // Apply a zoom effect to zoom the image in.
      onIdle(() => {
        zoomedImage.style.transform = ''
        document.body.classList.add(this.#classList.opened)
      })

      this.#currentZoom = { body, dialog, image, zoomedImage }
    }

    #close(disableAnimation = false) {
      window.removeEventListener('wheel', this.#onWheel)

      if (!this.#currentZoom) return

      const { zoomedImage } = this.#currentZoom

      // Remove the zoom effect from the zoomed image.
      zoomedImage.style.transform = zoomedImage.dataset[this.#dataZoomTransformKey] ?? ''
      document.body.classList.add(this.#classList.transition)
      document.body.classList.remove(this.#classList.opened)

      const { matches: prefersReducedMotion } = globalThis.matchMedia('(prefers-reduced-motion: reduce)')

      if (disableAnimation || prefersReducedMotion) {
        this.#onUnzoomEnd()
      } else {
        zoomedImage.addEventListener('transitionend', this.#onUnzoomEnd, { once: true })
      }
    }

    #onUnzoomEnd = () => {
      if (!this.#currentZoom) return

      const { dialog, image } = this.#currentZoom

      // Show the source image.
      document.body.classList.remove(this.#classList.transition)
      image.classList.remove(this.#classList.source)

      // Remove the portaled dialog.
      dialog.parentElement?.remove()

      // Restore some overridden styles.
      document.body.style.overflow = this.#currentZoom.body.overflow
      document.body.style.width = this.#currentZoom.body.width
      document.querySelector('header')?.style.setProperty('padding-inline-end', 'var(--sl-nav-pad-x)')

      // Reset the current zoom.
      this.#currentZoom = undefined

      // Restore the focus.
      if (this.#previousFocus instanceof HTMLElement) {
        this.#previousFocus.focus()
      }
    }

    #setCaption(text: string | null, figure: HTMLElement) {
      if (Object.hasOwn(this.dataset, 'hideCaption')) return

      text = text?.trim() ?? ''

      if (text.length === 0) return

      const caption = document.createElement('figcaption')
      caption.ariaHidden = 'true'
      caption.textContent = text

      figure.append(caption)
    }

    #cloneAndZoomImage(image: ZoomableElement) {
      const imageRect = image.getBoundingClientRect()

      // Preserve SVG aspect ratios while still allow them to scale up to the viewport.
      const isSVG = this.#isSVGElement(image) || this.#isSVGImage(image)
      const naturalWidth = isSVG ? imageRect.width : image.naturalWidth
      const naturalHeight = isSVG ? imageRect.height : image.naturalHeight

      const maxWidth = isSVG ? window.innerWidth : Math.min(window.innerWidth, naturalWidth)
      const maxHeight = isSVG ? window.innerHeight : Math.min(window.innerHeight, naturalHeight)
      const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight)

      const width = naturalWidth * scale
      const height = naturalHeight * scale
      const top = (window.innerHeight - height) / 2
      const left = (window.innerWidth - width) / 2

      const clone = image.cloneNode(true) as ZoomableElement
      clone.removeAttribute('id')

      clone.style.position = 'absolute'
      clone.style.width = `${width}px`
      clone.style.height = `${height}px`
      clone.style.top = `${top}px`
      clone.style.left = `${left}px`
      clone.style.transform = ''

      // Finds out the scale transformations so that the zoomed image fits within the image rect.
      let scaleX = imageRect.width / width
      let scaleY = imageRect.height / height

      // If the image is an SVG, normalize the scale.
      if (isSVG) {
        if (scaleX > scaleY) scaleY = scaleX
        else scaleX = scaleY
      }

      // Calculate the translation to align the zoomed image within the image rect.
      const translateX = (-left + (imageRect.width - width) / 2 + imageRect.left) / scaleX
      const translateY = (-top + (imageRect.height - height) / 2 + imageRect.top) / scaleY

      // Apply the scale and translation to the zoomed image.
      clone.style.transform = `scale(${scaleX}, ${scaleY}) translate3d(${translateX}px, ${translateY}px, 0)`

      // Save the transform to a data attribute to be able to animate it back to the original position.
      clone.dataset[this.#dataZoomTransformKey] = clone.style.transform

      // If the image is inside a `<picture>` element, we need to update the `src` attribute and use the correct
      // source.
      if (
        !isSVG &&
        image.parentElement?.tagName === 'PICTURE' &&
        image.currentSrc &&
        clone instanceof HTMLImageElement
      ) {
        clone.src = image.currentSrc
      }

      // If the image has an `id` attribute, set it on a data attribute on the zoomed image in case it's used by the
      // user.
      if (image.id) {
        clone.dataset['zoomId'] = image.id
      }

      return clone
    }

    #isSVGImage(image: HTMLImageElement) {
      if (image.currentSrc.toLowerCase().endsWith('.svg')) return true
      try {
        const url = new URL(image.currentSrc)
        if (url.pathname !== '/_image') return false
        const href = url.searchParams.get('href')
        return href?.includes('origFormat=svg')
      } catch {
        return false
      }
    }

    #isSVGElement(image: ZoomableElement): image is SVGElement {
      return image instanceof SVGElement
    }

    #getSVGTitle(image: ZoomableElement) {
      if (!this.#isSVGElement(image)) return null

      return image.querySelector('title')?.textContent?.trim() ?? null
    }
  },
)

type ZoomableElement = HTMLImageElement | SVGElement

interface CurrentZoom {
  body: { overflow: string; width: string }
  dialog: HTMLDialogElement
  image: ZoomableElement
  zoomedImage: ZoomableElement
}
