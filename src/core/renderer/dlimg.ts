import type { DrawElement } from '../schema/elements'
import { effectiveNumber } from './element-defaults'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type DlimgElement = Extract<DrawElement, { type: 'dlimg' }>

export function renderDlimg(element: DlimgElement, _ctx: RenderContext): RenderResult | null {
  void _ctx
  if (!isVisible(element.visible)) {
    return null
  }

  const primitive = {
    kind: 'dlimg-stub' as const,
    x: effectiveNumber(element, 'x', 0),
    y: effectiveNumber(element, 'y', 0),
    width: effectiveNumber(element, 'xsize', 1, 1),
    height: effectiveNumber(element, 'ysize', 1, 1),
    url: element.url,
    ...(element.rotate != null
      ? { rotate: effectiveNumber(element, 'rotate', 0) }
      : {}),
    ...(element.resize_method != null ? { resizeMethod: element.resize_method } : {}),
  }

  return { layer: 'canvas', primitive }
}
