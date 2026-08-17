// A stand-in for a host's *server-side* payload render (issue #109, ADR-018
// preview seam), for the fake host page.
//
// The point of `renderPreview` is that the image comes from somewhere else than
// the designer — a real Pillow/`imagegen` run in the OpenDisplay HA
// integration's dry-run path. So this deliberately does NOT reuse the
// designer's renderer: it is a crude, host-side rasterizer with its own font,
// its own template resolution and its own 1-bit quantization, and it looks
// visibly different from the designer's own preview. That difference is the
// feature — it is what makes the seam usable as the ADR-007 pixel-parity
// reference, and it is what a host-side bug would look like.
//
// Kept to the handful of element types and fields the demo payload uses; a real
// host calls its own backend instead of parsing anything here.

/** How long the fake "display" takes to answer — exercises the loading state. */
export const PREVIEW_RENDER_DELAY_MS = 450

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Resolve the two template calls the demo payload uses, from the host's own states. */
function resolveTemplates(text, states) {
  return text
    .replace(/\{\{\s*states\(\s*'([^']+)'\s*\)\s*\}\}/g, (_match, key) => {
      const entry = states[key]
      if (entry == null) {
        return 'unknown'
      }
      return String(typeof entry === 'object' ? entry.state : entry)
    })
    .replace(
      /\{\{\s*state_attr\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)\s*\}\}/g,
      (_match, key, attribute) => {
        const entry = states[key]
        const value = entry && typeof entry === 'object' ? entry.attributes?.[attribute] : undefined
        return value == null ? 'None' : String(value)
      },
    )
}

/** Split the element-list YAML into `{ key: value }` blocks — demo payloads only. */
function parseElements(payload) {
  return payload
    .split(/^- /m)
    .slice(1)
    .map((block) => {
      const element = {}
      for (const line of block.split('\n')) {
        const match = /^\s*([a-z_]+):\s*(.*?)\s*$/.exec(line)
        if (!match) {
          continue
        }
        const [, key, rawValue] = match
        element[key] = rawValue.replace(/^["'](.*)["']$/, '$1')
      }
      return element
    })
}

function number(value, fallback = 0) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * 1-bit quantization, the way the two dither settings differ on real hardware:
 * `dither: 0` is a hard threshold, `dither: 2` an ordered (Bayer 2x2) pattern
 * that turns mid-greys into visible checkerboards. Reds survive as reds — this
 * fake panel is BWR, like the demo's kitchen tag.
 */
function quantize(imageData, dither) {
  const bayer = [
    [0.25, 0.75],
    [1.0, 0.5],
  ]
  const { data, width } = imageData
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    if (red > 140 && red - green > 60 && red - blue > 60) {
      data[index] = 197
      data[index + 1] = 57
      data[index + 2] = 41
      continue
    }
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
    const pixel = index / 4
    const threshold =
      dither === 2 ? bayer[Math.floor(pixel / width) % 2][pixel % 2] : 0.5
    const value = luminance >= threshold ? 255 : 0
    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
  }
  return imageData
}

/**
 * Render the payload as this fake host's display would.
 *
 * The surface comes from `context.display` — the oriented logical canvas the
 * payload's coordinates are authored against, which the designer re-requests a
 * render for whenever it changes. A host that instead rendered its own idea of
 * the size (its stored target capabilities, say) would answer a re-orientation
 * with an image of the wrong shape, and the designer would letterbox it.
 *
 * @param {string} payload drawcustom element-list YAML, exactly as the designer sends it
 * @param {{ targetId?: string, display: { width: number, height: number, rotation: 0|90|180|270 }, service: { dither: 0|1|2 } }} context the preview context
 * @param {{ states?: object }} host what this host knows
 * @returns {Promise<Blob>} an `image/png` blob
 */
export async function renderPayloadOnFakeDisplay(payload, context, host = {}) {
  const { width, height } = context.display
  const states = host.states ?? {}

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.textBaseline = 'top'

  for (const element of parseElements(payload)) {
    if (element.type === 'text' || element.type === 'multiline') {
      const size = number(element.size, 20)
      // A monospace face, not the designer's: a server render has its own fonts.
      ctx.font = `${size}px monospace`
      ctx.fillStyle = element.color === 'red' ? '#c53929' : '#000000'
      ctx.fillText(resolveTemplates(element.value ?? '', states), number(element.x), number(element.y))
      continue
    }
    if (element.type === 'rectangle') {
      ctx.strokeStyle = element.outline === 'red' ? '#c53929' : '#000000'
      ctx.lineWidth = number(element.width, 1)
      const x = number(element.x_start)
      const y = number(element.y_start)
      ctx.strokeRect(x, y, number(element.x_end) - x, number(element.y_end) - y)
      continue
    }
    if (element.type === 'line') {
      ctx.strokeStyle = element.fill === 'red' ? '#c53929' : '#000000'
      ctx.lineWidth = number(element.width, 1)
      ctx.beginPath()
      ctx.moveTo(number(element.x_start), number(element.y_start))
      ctx.lineTo(number(element.x_end), number(element.y_end))
      ctx.stroke()
    }
  }

  // A grey band so the two dither settings are unmistakably different: flat
  // thresholds it to one solid tone, ordered turns it into a checkerboard.
  ctx.fillStyle = '#8a8a8a'
  ctx.fillRect(0, height - 12, width, 12)
  ctx.fillStyle = '#000000'
  ctx.font = '9px monospace'
  ctx.fillText(
    `host render · dither=${context.service.dither} · ${width}x${height}@${context.display.rotation}°`,
    3,
    height - 11,
  )

  const imageData = ctx.getImageData(0, 0, width, height)
  ctx.putImageData(quantize(imageData, context.service.dither), 0, 0)

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
