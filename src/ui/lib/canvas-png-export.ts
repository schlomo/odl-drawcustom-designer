import type opentype from 'opentype.js'
import { renderElement, type DrawElement, type DitherMode, type RenderContext } from '../../core'
import { drawCanvasStub } from './draw-canvas-stubs'
import { renderSvgPrimitiveMarkup } from './svg-primitive-markup'

export interface ExportCanvasSize {
  width: number
  height: number
}

export function resolveExportCanvasSize(renderContext: Pick<RenderContext, 'width' | 'height'>): ExportCanvasSize {
  return {
    width: renderContext.width,
    height: renderContext.height,
  }
}

export function resolveExportDitherMode(
  previewDitherMode: DitherMode | undefined,
  serviceDither: number | undefined,
): DitherMode {
  if (previewDitherMode === 2) {
    return 2
  }
  if (serviceDither === 2) {
    return 2
  }
  return 0
}

export interface RenderPayloadToPngOptions {
  elements: DrawElement[]
  renderContext: RenderContext
  assetImages: ReadonlyMap<string, HTMLImageElement>
  fontFamilies: ReadonlyMap<string, string>
  opentypeFonts: ReadonlyMap<string, opentype.Font>
  background?: string
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load SVG raster'))
    image.src = src
  })
}

async function drawSvgMarkupToCanvas(
  ctx: CanvasRenderingContext2D,
  markup: string,
  width: number,
  height: number,
): Promise<void> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${markup}</svg>`
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  ctx.drawImage(image, 0, 0, width, height)
}

/** Rasterize the payload at native canvas dimensions (not CSS preview scale). */
export async function renderPayloadToPngBlob(options: RenderPayloadToPngOptions): Promise<Blob> {
  const { width, height } = resolveExportCanvasSize(options.renderContext)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  ctx.fillStyle = options.background ?? '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const drawContext = {
    accentMode: options.renderContext.accentMode,
    ditherMode: options.renderContext.ditherMode,
  }

  for (const element of options.elements) {
    const result = renderElement(element, options.renderContext)
    if (!result) {
      continue
    }

    if (result.layer === 'canvas') {
      drawCanvasStub(
        ctx,
        result.primitive,
        options.assetImages,
        options.fontFamilies,
        options.opentypeFonts,
        drawContext,
      )
      continue
    }

    const markup = renderSvgPrimitiveMarkup(result.primitive, options.fontFamilies)
    await drawSvgMarkupToCanvas(ctx, markup, width, height)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('PNG export failed'))
      }
    }, 'image/png')
  })
}

/** Export from the live preview DOM when available (matches on-screen dither). */
export async function exportPaperDomToPngBlob(paper: HTMLElement, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const slots = paper.querySelectorAll(':scope > div')
  for (const slot of slots) {
    const layerCanvas = slot.querySelector('canvas')
    if (layerCanvas) {
      ctx.drawImage(layerCanvas, 0, 0, width, height)
      continue
    }

    const svg = slot.querySelector('svg')
    if (svg) {
      const serialized = new XMLSerializer().serializeToString(svg)
      const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`)
      ctx.drawImage(image, 0, 0, width, height)
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('PNG export failed'))
      }
    }, 'image/png')
  })
}
