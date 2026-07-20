import type opentype from 'opentype.js'
import {
  finalizeTagImageData,
  safeRenderElement,
  renderHalftonePatternDefs,
  type DrawElement,
  type DitherMode,
  type RenderContext,
} from '../../core'
import type { CanvasRotation } from '../preferences/displayConfig'
import { computeRotatedCanvasBounds } from './canvas-zoom'
import { drawCanvasStub } from './draw-canvas-stubs'
import { renderSvgPrimitiveMarkup } from './svg-primitive-markup'

export interface ExportCanvasSize {
  width: number
  height: number
}

export function resolveExportCanvasSize(
  renderContext: Pick<RenderContext, 'width' | 'height'>,
  rotation: CanvasRotation = 0,
): ExportCanvasSize {
  const bounds = computeRotatedCanvasBounds(renderContext.width, renderContext.height, rotation)
  return {
    width: bounds.width,
    height: bounds.height,
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
  rotation?: CanvasRotation
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

function rotateRenderedCanvas(
  source: HTMLCanvasElement,
  rotation: CanvasRotation,
): HTMLCanvasElement {
  if (rotation === 0) {
    return source
  }

  const bounds = computeRotatedCanvasBounds(source.width, source.height, rotation)
  const dest = document.createElement('canvas')
  dest.width = bounds.width
  dest.height = bounds.height
  const ctx = dest.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, bounds.width, bounds.height)

  switch (rotation) {
    case 90:
      ctx.setTransform(0, 1, -1, 0, source.height, 0)
      break
    case 180:
      ctx.setTransform(-1, 0, 0, -1, source.width, source.height)
      break
    case 270:
      ctx.setTransform(0, -1, 1, 0, 0, source.width)
      break
    default: {
      const _exhaustive: never = rotation
      return _exhaustive
    }
  }

  ctx.drawImage(source, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return dest
}

function finalizeExportCanvas(
  canvas: HTMLCanvasElement,
  renderContext: RenderContext,
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  finalizeTagImageData(imageData.data, canvas.width, canvas.height, {
    colorMode: renderContext.colorMode,
    ditherMode: renderContext.ditherMode,
    paletteOverrides: renderContext.paletteOverrides,
  })
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/** Rasterize the payload at native canvas dimensions (not CSS preview scale). */
export async function renderPayloadToPngBlob(options: RenderPayloadToPngOptions): Promise<Blob> {
  const rotation = options.rotation ?? 0
  const nativeWidth = options.renderContext.width
  const nativeHeight = options.renderContext.height
  const canvas = document.createElement('canvas')
  canvas.width = nativeWidth
  canvas.height = nativeHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  ctx.fillStyle = options.background ?? '#ffffff'
  ctx.fillRect(0, 0, nativeWidth, nativeHeight)

  const renderContext = options.renderContext
  const drawContext = {
    colorMode: renderContext.colorMode,
    ditherMode: renderContext.ditherMode,
    paletteOverrides: renderContext.paletteOverrides,
  }
  const patternDefs = renderHalftonePatternDefs(drawContext)

  for (const element of options.elements) {
    const result = safeRenderElement(element, renderContext)
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

    const markup = renderSvgPrimitiveMarkup(result.primitive, options.fontFamilies, {
      ...drawContext,
      patternDefs,
    })
    await drawSvgMarkupToCanvas(ctx, markup, nativeWidth, nativeHeight)
  }

  const rotated = rotateRenderedCanvas(canvas, rotation)
  finalizeExportCanvas(rotated, renderContext)

  return new Promise((resolve, reject) => {
    rotated.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('PNG export failed'))
      }
    }, 'image/png')
  })
}

/** Export from the live preview DOM when available (matches on-screen dither). */
export async function exportPaperDomToPngBlob(
  paper: HTMLElement,
  width: number,
  height: number,
  renderContext?: Pick<RenderContext, 'colorMode' | 'ditherMode' | 'paletteOverrides'>,
): Promise<Blob> {
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

  if (renderContext) {
    finalizeExportCanvas(canvas, {
      width,
      height,
      colorMode: renderContext.colorMode,
      ditherMode: renderContext.ditherMode,
      paletteOverrides: renderContext.paletteOverrides,
    })
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
