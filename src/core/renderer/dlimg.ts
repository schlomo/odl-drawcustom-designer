import type { DrawElement } from '../schema/elements'
import { effectiveNumber } from './element-defaults'
import { imageUnavailableMessage } from './image-availability'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type DlimgElement = Extract<DrawElement, { type: 'dlimg' }>

export function renderDlimg(element: DlimgElement, _ctx: RenderContext): RenderResult | null {
  void _ctx
  if (!isVisible(element.visible)) {
    return null
  }

  // Unlike font metrics, core never needed to know whether an image asset
  // resolved — image decoding is a browser/UI concern (draw-canvas-stubs.ts
  // draws a placeholder when the decoded image isn't available). A
  // confirmed-missing/failed image was previously silently ignored: the
  // element kept "rendering" (a dlimg-stub primitive referencing a URL with
  // nothing behind it), with no error marker or banner attribution (issue
  // #55, following the same #53 ruling for fonts). If the loader has
  // settled this URL as unavailable, throw here — safeRenderElement's
  // existing catch (issue #10) turns that into the render-error placeholder
  // + surfaced message automatically, at the element's own declared
  // rectangle (see render-error.ts's elementDeclaredBounds).
  if (element.url) {
    const unavailableMessage = imageUnavailableMessage(element.url)
    if (unavailableMessage) {
      throw new Error(unavailableMessage)
    }
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
