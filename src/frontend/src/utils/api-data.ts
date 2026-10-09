const frozenData = new WeakSet<object>();

/** Freeze a JSON graph once, including shared objects and cycles. */
export function freezeApiData(value: object, seen = new WeakSet<object>()): void {
  if (frozenData.has(value) || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value) as unknown[]) {
    if (child && typeof child === 'object') freezeApiData(child, seen);
  }
  Object.freeze(value);
  frozenData.add(value);
}
