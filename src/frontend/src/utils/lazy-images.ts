/**
 * Native lazy loading never starts for images inside `display: none` content, such as an inactive
 * tab panel or the inactive language's icon, so they would only begin downloading once they are
 * revealed. Once `root` is within `rootMargin` of the viewport, switch the lazy images inside it to
 * eager loading so they are ready when revealed, without adding them to the initial page load.
 *
 * Returns a function that stops waiting for `root` to approach the viewport.
 */
export function loadLazyImagesNearViewport(root: Element, rootMargin = '1500px 0px'): () => void {
  const loadImages = () => {
    root.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((image) => {
      image.loading = 'eager';
    });
  };

  if (!('IntersectionObserver' in window)) {
    loadImages();
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      loadImages();
      observer.disconnect();
    },
    { rootMargin }
  );
  observer.observe(root);

  return () => observer.disconnect();
}
