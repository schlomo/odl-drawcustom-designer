/**
 * A `data:` URL carries its content inline, so it is never an asset to look up:
 * not in the content map, not among the bundled assets, never a host question
 * (ADR-002). The Load Demo's `dlimg` ships its picture this way so the demo
 * sends to a real display unchanged — odl-renderer decodes `data:` URIs itself.
 */
export function isDataUrl(key: string): boolean {
  return key.startsWith('data:')
}
