import type { DrawElement } from '../schema/elements'
import { resolveBounds, type ResolvedBounds } from './bounds'
import { effectiveNumber } from './element-defaults'
import type { RenderContext, RenderResult } from './types'

/** Fixed placeholder size (px) for point-anchored elements (plain x/y, no
 * declared box) — deliberately simple/deterministic, since the whole point
 * is to stay safe when the real renderer (which knows how to compute real
 * bounds for this element type) just threw. Box-declared elements use their
 * own declared rectangle instead — see `elementDeclaredBounds` below. */
const PLACEHOLDER_SIZE = 32

function finiteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
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

/**
 * Best-effort DECLARED bounds for box-declared element types — computed the
 * same way each type's real renderer would (before whatever problem made it
 * throw), not a fixed-size guess anchored at (0, 0). Point-anchored types
 * (text, icon, ...) return `null` here and fall back to `elementAnchor` +
 * the fixed placeholder size, unchanged.
 *
 * Scoped to the element types that can actually reach this function today
 * (`plot`/`progress_bar`/`debug_grid` via issue #53's font-unavailable
 * throw; `dlimg` via issue #55's image-unavailable throw; `text`/`multiline`
 * are point-anchored) rather than speculatively covering every schema shape
 * with untested geometry — see the render-error placeholder tests for the
 * exact cases this is verified against.
 */
function elementDeclaredBounds(element: DrawElement, ctx: RenderContext): ResolvedBounds | null {
  switch (element.type) {
    case 'debug_grid':
      // No x/y of its own — the grid always spans the full canvas.
      return { x: 0, y: 0, width: ctx.width, height: ctx.height }
    case 'progress_bar':
      return resolveBounds(element.x_start, element.x_end, element.y_start, element.y_end, ctx)
    case 'plot':
      // All four are optional on `plot` — mirror renderPlot's own fallback
      // to the full canvas when unset.
      return resolveBounds(
        element.x_start ?? 0,
        element.x_end ?? ctx.width,
        element.y_start ?? 0,
        element.y_end ?? ctx.height,
        ctx,
      )
    case 'dlimg':
      // Mirrors renderDlimg's own primitive geometry exactly (x/y + declared
      // xsize/ysize, top-left anchored) — not point + fixed size, so a
      // missing/failed image's marker occupies the image's real declared
      // rectangle (maintainer ruling on issue #55: same principle as
      // plot/progress_bar — the element stays selectable/draggable/
      // resizable at its own bounds; the marker is only what paints inside).
      return {
        x: effectiveNumber(element, 'x', 0),
        y: effectiveNumber(element, 'y', 0),
        width: effectiveNumber(element, 'xsize', 1, 1),
        height: effectiveNumber(element, 'ysize', 1, 1),
      }
    default:
      return null
  }
}

/** `elementDeclaredBounds` must never itself throw — it runs inside the
 * fallback path for an element that already threw once. */
function safeElementDeclaredBounds(element: DrawElement, ctx: RenderContext): ResolvedBounds | null {
  try {
    return elementDeclaredBounds(element, ctx)
  } catch {
    return null
  }
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
  // Box-declared elements (plot, progress_bar, debug_grid) get their full
  // declared rectangle; point-anchored elements (text, ...) fall back to the
  // fixed-size box at their x/y anchor, exactly as before. Using a fixed
  // 32px box at (0, 0) for a box-declared element (maintainer manual-test
  // finding on ba7912f) put the marker nowhere near the element's real
  // position, and out of sync with the selection frame / hit-testing, which
  // both derive from this same primitive once fresh (see
  // hidden-element-hints.ts's resolveElementHitBounds).
  const declared = safeElementDeclaredBounds(element, ctx)
  const anchor = elementAnchor(element)
  const requestedX = finiteOr(declared?.x ?? anchor.x, anchor.x)
  const requestedY = finiteOr(declared?.y ?? anchor.y, anchor.y)
  const requestedWidth = finiteOr(declared?.width ?? PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)
  const requestedHeight = finiteOr(declared?.height ?? PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)

  const width = Math.max(1, Math.min(requestedWidth, ctx.width))
  const height = Math.max(1, Math.min(requestedHeight, ctx.height))
  // Clamp the origin *after* sizing so the marker always lies fully within
  // the canvas. Right/bottom-anchored elements commonly set x/y to the
  // canvas edge (e.g. x = ctx.width) — starting the placeholder there would
  // clip it entirely off-canvas, vanishing the failed element all over
  // again (see the "canvas-edge-anchored element" test).
  const x = Math.min(Math.max(requestedX, 0), Math.max(ctx.width - width, 0))
  const y = Math.min(Math.max(requestedY, 0), Math.max(ctx.height - height, 0))
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
