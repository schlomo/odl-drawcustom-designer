/**
 * Look an element up by id in the root the origin element lives in — the
 * shadow root when embedded (issue #21), the document standalone. A plain
 * `document.getElementById` cannot see into shadow trees, so id-linked
 * controls (e.g. a button forwarding its click to a hidden file input) must
 * resolve through their own root.
 */
export function getScopedElementById(origin: Element, id: string): HTMLElement | null {
  const root = origin.getRootNode()
  if (root instanceof Document || root instanceof ShadowRoot) {
    const found = root.getElementById(id)
    return found instanceof HTMLElement ? found : null
  }
  return null
}
