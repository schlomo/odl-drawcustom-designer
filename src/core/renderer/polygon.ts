import type { DrawElement } from '../schema/elements'
import { hasTemplateSyntax } from '../templates/patterns'
import { effectiveStrokeWidth, resolveShapePaint } from './element-defaults'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type PolygonElement = Extract<DrawElement, { type: 'polygon' }>
type PolygonPoints = PolygonElement['points'] extends infer T
  ? Exclude<T, string>
  : never

function isCoordinatePairArray(value: unknown): value is PolygonPoints {
  return (
    Array.isArray(value) &&
    value.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair.every((coord) => typeof coord === 'number' && Number.isFinite(coord)),
    )
  )
}

/**
 * Resolve the `points` field (`jsonOrTemplateSchema`) to a real list of
 * coordinate pairs. By render time this is either the structured array
 * (unchanged) or — once the preview evaluator has run — a STRING, because a
 * whole-field template only ever produces a string in the designer's Nunjucks
 * evaluator. Production is unaffected: Home Assistant's
 * `Template.async_render()` preserves the native list for a single pure
 * `{{ expr }}` expression (issue #56 follow-up).
 *
 * Recovery, in order of confidence:
 * 1. Valid JSON array of `[x, y]` pairs (e.g. a `tojson`-style filter).
 * 2. Nunjucks' default Array→String coercion, which flat-joins nested arrays
 *    with commas (`{{ [[0,0],[60,0]] }}` → "0,0,60,0"). Numbers never contain
 *    commas, so an even-length list of finite numbers reconstructs the exact
 *    pairs Home Assistant would have delivered natively.
 *
 * Anything else throws into the standard render-error placeholder instead of
 * silently substituting the unrelated fixed preview triangle — a
 * plausible-looking wrong shape is worse than an honest failure indicator
 * (issue #10).
 */
function resolvePolygonPoints(value: PolygonElement['points']): PolygonPoints {
  if (Array.isArray(value)) {
    return value
  }

  try {
    const parsed: unknown = JSON.parse(value)
    if (isCoordinatePairArray(parsed)) {
      return parsed
    }
  } catch {
    // Not JSON — fall through to the remaining strategies.
  }

  // Still literally `{{ … }}`/`{% … %}` — evaluation never ran, or threw and
  // fell back to the original raw text.
  if (hasTemplateSyntax(value)) {
    throw new Error(
      `Polygon "points" template did not resolve to a list of coordinate pairs: "${value}"`,
    )
  }

  const tokens = value.split(',').map((token) => Number(token.trim()))
  if (
    tokens.length >= 2 &&
    tokens.length % 2 === 0 &&
    tokens.every((token) => Number.isFinite(token))
  ) {
    const pairs: [number, number][] = []
    for (let index = 0; index < tokens.length; index += 2) {
      pairs.push([tokens[index]!, tokens[index + 1]!])
    }
    return pairs
  }

  throw new Error(
    `Polygon "points" template did not resolve to a list of coordinate pairs: "${value}"`,
  )
}

export function renderPolygon(element: PolygonElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const paintOptions = paintOptionsFromContext(ctx)

  const points = resolvePolygonPoints(element.points)

  return {
    layer: 'svg',
    primitive: {
      kind: 'polygon',
      points,
      fill: resolveShapePaint(element, 'fill', paintOptions),
      stroke: resolveShapePaint(element, 'outline', paintOptions, 'black') ?? undefined,
      strokeWidth: effectiveStrokeWidth(element, 'width', 1),
    },
  }
}
