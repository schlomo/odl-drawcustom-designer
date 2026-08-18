// A stand-in for a host's *server-side* payload render (issue #109, ADR-018
// preview seam), for the fake host page.
//
// Earlier versions of this file wrote a crude host-side rasterizer of its
// own: its own monospace font, its own line-by-line YAML "parser" (a regex
// per `key: value` line), its own 1-bit quantization. That parser choked on
// anything the real serializer emits as a YAML block scalar — `value: |-`
// for a literal newline, `value: >-` for a long folded string (the
// designer's own multi-line/long-template text values both round-trip that
// way, see src/core/yaml/blockScalars.ts) — and rendered the scalar's own
// `|-`/`>-` marker as if it were the text itself. A maintainer manual
// validation on PR #143 caught it as literal "| -" garbage on screen.
//
// The fix (maintainer ruling): this fake host has no real backend to render
// against, so instead of maintaining a second, ever-incomplete renderer, it
// round-trips the DESIGNER'S OWN PNG export — `handle.getPngBlob()`, full
// font/renderer fidelity, the exact bytes Copy/Download PNG would produce —
// and stamps a small, deterministic info strip on top so the image is
// unmistakably *this host's* render and visibly carries the request's own
// parameters (size, rotation, dither), not the designer's client preview.
// Less demo code to maintain, and no parser to go stale against the real
// serializer's block-scalar choices.

/** How long the fake "display" takes to answer — exercises the loading state. */
export const PREVIEW_RENDER_DELAY_MS = 450

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('the display could not decode its own render'))
    image.src = src
  })
}

/**
 * Stamp a small, fixed-height info strip onto the designer's own PNG export
 * so the returned image reads as *this host's* render, not a copy of the
 * designer's client preview — and so it visibly carries the request's own
 * parameters (size, rotation, dither) rather than looking parameterless.
 *
 * Deterministic and geometry-independent in height (a 12px band regardless
 * of panel size), so the e2e dither/rotation pixel probes — which sample the
 * whole image — keep seeing the *design* differ with dither/rotation; the
 * strip itself does not need to (it is host chrome, not part of the design).
 *
 * @param {Blob} designPng the designer's own PNG export ({@link
 *   MountHandle.getPngBlob}), already at `context.display`'s exact size
 * @param {{ display: { width: number, height: number, rotation: 0|90|180|270 }, service: { dither: 0|1|2 } }} context
 * @returns {Promise<Blob>} an `image/png` blob
 */
export async function stampHostPreview(designPng, context) {
  const { width, height, rotation } = context.display
  const objectUrl = URL.createObjectURL(designPng)
  let image
  try {
    image = await loadImage(objectUrl)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, width, height)

  const stripHeight = 12
  ctx.fillStyle = '#8a8a8a'
  ctx.fillRect(0, height - stripHeight, width, stripHeight)
  ctx.fillStyle = '#000000'
  ctx.font = '9px monospace'
  ctx.textBaseline = 'top'
  ctx.fillText(
    `demo host render — ${width}×${height} @ ${rotation}°, dither ${context.service.dither}`,
    3,
    height - stripHeight + 1,
  )

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('the display could not encode the render'))
      }
    }, 'image/png')
  })
}
