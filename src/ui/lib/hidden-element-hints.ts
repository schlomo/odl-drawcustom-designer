import {
  isVisible,
  renderElement,
  type DrawElement,
  type RenderContext,
  type RenderResult,
} from '../../core'
import { isFillNoneOnTag } from './hidden-on-tag'
import { getPrimitiveBounds, type ElementBounds } from './primitive-bounds'

export type HiddenElementReason = 'visible_false' | 'fill_none'

export interface HiddenElementHint {
  reason: HiddenElementReason
  bounds: ElementBounds
}

function elementHasVisibleProperty(element: DrawElement): element is DrawElement & {
  visible?: boolean | 'true' | 'false' | 'True' | 'False'
} {
  return 'visible' in element
}

function renderIgnoringVisibility(
  element: DrawElement,
  ctx: RenderContext,
): RenderResult | null {
  if (!elementHasVisibleProperty(element) || isVisible(element.visible)) {
    return renderElement(element, ctx)
  }

  return renderElement({ ...element, visible: true } as DrawElement, ctx)
}

function boundsForHiddenElement(
  element: DrawElement,
  renderResult: RenderResult | null,
  ctx: RenderContext,
): ElementBounds | null {
  if (renderResult) {
    return getPrimitiveBounds(renderResult.primitive)
  }

  const visibleResult = renderIgnoringVisibility(element, ctx)
  return visibleResult ? getPrimitiveBounds(visibleResult.primitive) : null
}

export function resolveHiddenElementHint(
  element: DrawElement,
  renderResult: RenderResult | null,
  ctx: RenderContext,
): HiddenElementHint | null {
  if (!ctx.showHiddenHints) {
    return null
  }

  if (renderResult === null && elementHasVisibleProperty(element) && !isVisible(element.visible)) {
    const bounds = boundsForHiddenElement(element, renderResult, ctx)
    return bounds ? { reason: 'visible_false', bounds } : null
  }

  if (isFillNoneOnTag(element)) {
    const bounds = boundsForHiddenElement(element, renderResult, ctx)
    return bounds ? { reason: 'fill_none', bounds } : null
  }

  return null
}

/** Canvas hit-test bounds — includes hidden-on-tag elements when invisible overlays are enabled. */
export function resolveElementHitBounds(
  element: DrawElement,
  ctx: RenderContext,
): ElementBounds | null {
  const result = renderElement(element, ctx)
  if (result && !isFillNoneOnTag(element)) {
    return getPrimitiveBounds(result.primitive)
  }

  const hint = resolveHiddenElementHint(element, result, ctx)
  return hint?.bounds ?? (result ? getPrimitiveBounds(result.primitive) : null)
}

export function hiddenHintTitle(reason: HiddenElementReason): string {
  return reason === 'visible_false'
    ? 'Invisible on tag (visible: false) — designer overlay only'
    : 'Invisible on tag (fill: none) — designer overlay only'
}
