/**
 * A `data:` URL carries its content inline, so it is never an asset to look up:
 * not in the content map, not among the bundled assets, never a host question
 * (ADR-002). The Load Demo's `dlimg` ships its picture this way so the demo
 * sends to a real display unchanged — odl-renderer decodes `data:` URIs itself.
 *
 * The scheme is case-insensitive (RFC 2397).
 */
export function isDataUrl(key: string): boolean {
  return /^data:/i.test(key)
}

/**
 * Raster formats Pillow decodes on the Home Assistant side. `jpg` is a common
 * non-standard spelling browsers accept; Pillow sniffs the bytes, not the
 * media type, so it sends fine too.
 */
const HA_RASTER_DATA_URL = /^data:image\/(png|jpe?g|gif|bmp|webp);base64,/i

/**
 * Only what a real send can render: odl-renderer's `load_image` decodes
 * `;base64,` payloads with Pillow, which has no SVG decoder. A browser would
 * happily preview `data:image/svg+xml` or a non-base64 payload — the exact
 * "previews here, fails on the display" gap the inline demo image exists to
 * close — so the designer holds `data:` images to the same rule.
 */
export function isRenderableImageDataUrl(key: string): boolean {
  return HA_RASTER_DATA_URL.test(key)
}

/** The media type of a `data:` URL (`image/png`), or `''` when it names none. */
export function dataUrlMediaType(key: string): string {
  const match = /^data:([^;,]*)/i.exec(key)
  return match?.[1]?.toLowerCase() ?? ''
}
