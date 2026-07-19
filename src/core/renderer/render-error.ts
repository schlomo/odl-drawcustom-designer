import type { DrawElement } from '../schema/elements'
import type { RenderContext, RenderResult } from './types'

/** Fixed placeholder size (px) — deliberately simple/deterministic rather than
 * type-aware, since the whole point is to stay safe when the real renderer
 * (which knows how to compute real bounds for this element type) just threw. */
const PLACEHOLDER_SIZE = 32

function finiteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Best-effort (x, y) anchor for the placeholder: use the element's own `x`/`y`
 * fields when they're present and are plain finite numbers. Templated or
 * percentage coordinates are ignored — safety here matters more than
 * precision, since evaluating them is exactly the kind of work that may have
 * caused the original throw. */
function elementAnchor(element: DrawElement): { x: number; y: number } {
  const x = 'x' in element ? finiteNumberOrZero(element.x) : 0
  const y = 'y' in element ? finiteNumberOrZero(element.y) : 0
  return { x, y }
}

export function renderErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return typeof error === 'string' ? error : 'Unknown render error'
}

/**
 * Placeholder shown in place of an element whose renderer threw. Keeps the
 * element visible (bounds, hit-testable) instead of vanishing entirely — see
 * `safeRenderElement` and issue #10.
 *
 * Deliberately an explicit `render-error` marker, not an approximation of the
 * element's real content: a wrong-looking render that could pass for genuine
 * output is worse than an honest, unmistakable failure indicator. If in
 * doubt between "show approximate content" and "show error", show error.
 */
export function buildRenderErrorPlaceholder(
  element: DrawElement,
  ctx: RenderContext,
  error: unknown,
): RenderResult {
  const { x, y } = elementAnchor(element)
  const width = Math.max(1, Math.min(PLACEHOLDER_SIZE, ctx.width))
  const height = Math.max(1, Math.min(PLACEHOLDER_SIZE, ctx.height))
  const message = renderErrorMessage(error)

  return {
    layer: 'svg',
    primitive: {
      kind: 'render-error',
      x,
      y,
      width,
      height,
      message,
    },
    error: message,
  }
}
