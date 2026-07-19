import type { DrawElement } from '../schema/elements'
import { renderArc } from './arc'
import { renderCircle } from './circle'
import { renderDebugGrid } from './debug-grid'
import { renderDlimg } from './dlimg'
import { renderEllipse } from './ellipse'
import { renderIcon } from './icon'
import { renderIconSequence } from './icon-sequence'
import { renderLine } from './line'
import { renderMultiline } from './multiline'
import { renderPlot } from './plot'
import { renderPolygon } from './polygon'
import { renderProgressBar } from './progress-bar'
import { renderQrcode } from './qrcode'
import { renderRectangle } from './rectangle'
import { renderRectanglePattern } from './rectangle-pattern'
import { renderText } from './text'
import { buildRenderErrorPlaceholder } from './render-error'
import type { RenderContext, RenderResult } from './types'

export function renderElement(element: DrawElement, ctx: RenderContext): RenderResult | null {
  switch (element.type) {
    case 'debug_grid':
      return renderDebugGrid(element, ctx)
    case 'text':
      return renderText(element, ctx)
    case 'multiline':
      return renderMultiline(element, ctx)
    case 'line':
      return renderLine(element, ctx)
    case 'rectangle':
      return renderRectangle(element, ctx)
    case 'rectangle_pattern':
      return renderRectanglePattern(element, ctx)
    case 'polygon':
      return renderPolygon(element, ctx)
    case 'circle':
      return renderCircle(element, ctx)
    case 'ellipse':
      return renderEllipse(element, ctx)
    case 'arc':
      return renderArc(element, ctx)
    case 'icon':
      return renderIcon(element, ctx)
    case 'icon_sequence':
      return renderIconSequence(element, ctx)
    case 'dlimg':
      return renderDlimg(element, ctx)
    case 'qrcode':
      return renderQrcode(element, ctx)
    case 'plot':
      return renderPlot(element, ctx)
    case 'progress_bar':
      return renderProgressBar(element, ctx)
    default: {
      const _exhaustive: never = element
      throw new Error(`Unhandled element type: ${(_exhaustive as DrawElement).type}`)
    }
  }
}

/**
 * Best-effort render — never throws (templated/incomplete values must not crash the UI)
 * and never vanishes an element completely: a render-time exception still returns a
 * placeholder RenderResult (bounds/outline + `.error`) so the element stays visible and
 * findable instead of disappearing with no trace (issue #10). A `null` return only ever
 * means the element is legitimately invisible (e.g. `visible: false`), not that it failed.
 */
export function safeRenderElement(element: DrawElement, ctx: RenderContext): RenderResult | null {
  try {
    return renderElement(element, ctx)
  } catch (error) {
    return buildRenderErrorPlaceholder(element, ctx, error)
  }
}

export function renderPayload(elements: DrawElement[], ctx: RenderContext): RenderResult[] {
  return elements.flatMap((element) => {
    const result = safeRenderElement(element, ctx)
    return result ? [result] : []
  })
}

export {
  ICON_DEFAULT_ANCHOR,
  TEXT_DEFAULT_ANCHOR,
  iconSequenceBoxSize,
  iconSequenceIconPositions,
  isOppositeResizeHandle,
  oppositeResizeHandleForAnchor,
  resolveAnchoredBox,
  anchorPointFromBox,
  resolveDirection,
  seSizeFromOppositeHandlePointer,
} from './anchors'
export { buildArcPiePath, arcPieSliceBounds } from './arc-geometry'
export {
  findMissingCharacters,
  formatMissingCharacterSample,
  isIgnorableCharacter,
  scanGlyphCoverageIssues,
  type GlyphCoverageIssue,
} from './glyph-coverage'
export { getCanvasTextDrawStyle, type CanvasTextDrawStyle } from './text-anchor-draw'
export { computeOpentypeGlyphPositions, type OpentypeGlyphPosition } from './opentype-glyphs'
export { createQrModuleGrid, qrRenderedSize, type QrModuleGrid } from './qr-modules'
export { effectiveNumber, effectiveProperty, effectiveString } from './element-defaults'
export { getDominantTextDirection, toVisualText } from './bidi-text'
export { mapColor } from './colors'
export {
  halftonePatternId,
  paintOptionsFromContext,
  paintOptionsFromDrawColor,
  renderHalftonePatternDefs,
  resolvePreviewCanvasPaint,
  resolvePreviewPaint,
  resolvePreviewPaintFallback,
  getColorPreviewClampInfo,
  resolvePreviewPaint as resolveSvgPaint,
  type PreviewDrawColorContext,
  type PreviewPaintOptions,
} from './preview-paint'
export {
  applyOrderedDitherBuffer,
  halftoneTileColors,
  finalizeTagImageData,
  isHalftoneColorName,
  resolveHalftonePair,
  resolvePreviewColor,
  sampleOrderedDitherColor,
  shouldUseHalftonePattern,
} from './dither'
export type { HalftonePair } from './dither'
export { parseColorMarkup, stripColorMarkup } from './parse-colors'
export type { TextColorSegment } from './parse-colors'
export { resolveBounds } from './bounds'
export {
  isNumericStringCoordinate,
  isPercentageCoordinate,
  resolveCoordinate,
  resolveX,
  resolveY,
  TEMPLATE_COORDINATE_PLACEHOLDER,
} from './coordinates'
export { fontFamilyNameForKey } from './font-family-name'
export {
  clearFontRegistry,
  clearFontUnavailable,
  DEFAULT_FONT_KEY,
  fontUnavailableMessage,
  getFont,
  markFontUnavailable,
  parseFont,
  registerFont,
  unregisterFont,
} from './fonts'
export {
  clearImageAvailabilityRegistry,
  clearImageUnavailable,
  imageUnavailableMessage,
  markImageUnavailable,
} from './image-availability'
export {
  layoutMultilineBlock,
  layoutTextBlock,
  measureTextWidth,
  positionTextDrawLines,
  wrapTextLines,
  type TextBlockLayout,
} from './text-layout'
export { mdiExportName, normalizeMdiIconName, resolveMdiPath } from './mdi-icons'
export { renderArc } from './arc'
export { renderCircle } from './circle'
export { renderDebugGrid, DEBUG_GRID_MIN_SPACING } from './debug-grid'
export { renderDlimg } from './dlimg'
export { renderEllipse } from './ellipse'
export { renderIcon } from './icon'
export { renderIconSequence } from './icon-sequence'
export { renderLine } from './line'
export { renderMultiline } from './multiline'
export { renderPlot } from './plot'
export { renderPolygon } from './polygon'
export { renderProgressBar } from './progress-bar'
export { renderQrcode } from './qrcode'
export { renderRectangle } from './rectangle'
export { renderRectanglePattern } from './rectangle-pattern'
export { renderText } from './text'
export type {
  AccentMode,
  ColoredTextDrawSegment,
  DitherMode,
  CanvasDlimgStubPrimitive,
  CanvasMultilineStubPrimitive,
  CanvasPlotPrimitive,
  CanvasPrimitive,
  CanvasQrcodePrimitive,
  PlotAxisLine,
  PlotGridLine,
  PlotLegendLabel,
  PlotSeriesPrimitive,
  CanvasRenderResult,
  CanvasTextStubPrimitive,
  TextDrawLine,
  ColorOptions,
  RenderContext,
  RenderPrimitive,
  RenderResult,
  SvgArcPrimitive,
  SvgCirclePrimitive,
  SvgDebugGridStubPrimitive,
  SvgEllipsePrimitive,
  SvgIconPrimitive,
  SvgIconSequenceIcon,
  SvgIconSequencePrimitive,
  SvgLinePrimitive,
  SvgPolygonPrimitive,
  SvgPrimitive,
  SvgProgressBarStubPrimitive,
  SvgRectPrimitive,
  SvgRectanglePatternStubPrimitive,
  SvgRenderResult,
} from './types'
