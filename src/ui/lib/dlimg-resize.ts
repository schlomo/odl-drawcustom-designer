import type { TagColorMode, DitherMode } from '../../core'
import { finalizeTagImageData } from '../../core'

export type DlimgResizeMethod = 'stretch' | 'crop' | 'cover' | 'contain'

export interface DlimgDrawRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DlimgImageDrawParams {
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
  clip: boolean
}

function imageDimensions(image: Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight' | 'width' | 'height'>): {
  width: number
  height: number
} {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  return { width: Math.max(1, width), height: Math.max(1, height) }
}

/** Map canvas dlimg resize_method to drawImage source/dest parameters. */
export function dlimgImageDrawParams(
  image: Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight' | 'width' | 'height'>,
  dest: DlimgDrawRect,
  resizeMethod: DlimgResizeMethod | undefined,
): DlimgImageDrawParams {
  const method = resizeMethod ?? 'stretch'
  const { width: imgW, height: imgH } = imageDimensions(image)
  const fullSource = { sx: 0, sy: 0, sw: imgW, sh: imgH }

  if (method === 'stretch') {
    return {
      ...fullSource,
      dx: dest.x,
      dy: dest.y,
      dw: dest.width,
      dh: dest.height,
      clip: false,
    }
  }

  const scale =
    method === 'contain'
      ? Math.min(dest.width / imgW, dest.height / imgH)
      : Math.max(dest.width / imgW, dest.height / imgH)

  const drawW = imgW * scale
  const drawH = imgH * scale
  const dx = dest.x + (dest.width - drawW) / 2
  const dy = dest.y + (dest.height - drawH) / 2

  if (method === 'contain') {
    return {
      ...fullSource,
      dx,
      dy,
      dw: drawW,
      dh: drawH,
      clip: false,
    }
  }

  // cover and crop: scale to fill, center, clip to destination box
  return {
    ...fullSource,
    dx,
    dy,
    dw: drawW,
    dh: drawH,
    clip: true,
  }
}

export interface DlimgDrawOptions {
  colorMode?: TagColorMode
  ditherMode?: DitherMode
}

function postProcessDrawnRegion(
  ctx: CanvasRenderingContext2D,
  dest: DlimgDrawRect,
  options: DlimgDrawOptions,
): void {
  if (options.colorMode == null || options.colorMode === 'rgb') {
    return
  }

  const { x, y, width, height } = dest
  const imageData = ctx.getImageData(x, y, width, height)
  finalizeTagImageData(imageData.data, width, height, {
    colorMode: options.colorMode,
    ditherMode: options.ditherMode,
  })
  ctx.putImageData(imageData, x, y)
}

export function drawDlimgToCanvas(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  dest: DlimgDrawRect,
  resizeMethod: DlimgResizeMethod | undefined,
  options: DlimgDrawOptions = {},
): void {
  const params = dlimgImageDrawParams(image, dest, resizeMethod)

  if (params.clip) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(dest.x, dest.y, dest.width, dest.height)
    ctx.clip()
    ctx.drawImage(image, params.sx, params.sy, params.sw, params.sh, params.dx, params.dy, params.dw, params.dh)
    ctx.restore()
  } else {
    ctx.drawImage(image, params.sx, params.sy, params.sw, params.sh, params.dx, params.dy, params.dw, params.dh)
  }

  if (options.colorMode != null) {
    postProcessDrawnRegion(ctx, dest, options)
  }
}
