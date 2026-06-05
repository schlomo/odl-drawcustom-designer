import type { DrawElement } from '../schema/elements'
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
    x: element.x,
    y: element.y,
    width: element.xsize,
    height: element.ysize,
    url: element.url,
    ...(element.rotate != null ? { rotate: element.rotate } : {}),
    ...(element.resize_method != null ? { resizeMethod: element.resize_method } : {}),
  }

  return { layer: 'canvas', primitive }
}
