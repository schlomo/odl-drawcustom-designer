import type { DrawElement } from '../schema/elements'
import { hasTemplateSyntax } from '../templates/patterns'
import {
  ICON_DEFAULT_ANCHOR,
  iconSequenceBoxSize,
  iconSequenceIconPositions,
  resolveAnchoredBox,
  resolveDirection,
} from './anchors'
import { effectiveFontSize, effectiveNumber, effectiveString, resolveIconPaint } from './element-defaults'
import { resolveX, resolveY } from './coordinates'
import { resolveMdiPath } from './mdi-icons'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type IconSequenceElement = Extract<DrawElement, { type: 'icon_sequence' }>

/**
 * Resolve the `icons` field (`jsonOrTemplateSchema`) to a real list of icon
 * names. By render time this is either the structured array (unchanged) or —
 * once the preview evaluator has run (`applyTemplateContextToPayload`) — a
 * STRING, because a whole-field template only ever produces a string here.
 *
 * That's a designer-only limitation, not a production one (issue #56
 * follow-up): Home Assistant's `Template.async_render()` preserves the
 * NATIVE type of a template that is a single pure `{{ expr }}` expression, so
 * `open_epaper_link.drawcustom` receives a real Python list directly — there
 * is never a stringified list to re-parse in production. The designer's own
 * Nunjucks-based preview evaluator (`evaluate.ts`) has no equivalent
 * native-type channel (`renderString` always stringifies its result), so a
 * templated icons list arrives here as plain text. Recover it on a
 * best-effort basis rather than silently swapping in the unrelated
 * `help-circle` placeholder — a plausible-looking wrong icon is exactly the
 * "could pass for genuine content" render the render-error contract exists to
 * avoid (see render-error.ts, issue #10).
 */
function resolveIconSequenceIconNames(value: string[] | string): string[] {
  if (Array.isArray(value)) {
    return value
  }

  // Valid JSON array (e.g. a `tojson`/`dump`-equivalent filter in the
  // template) — the unambiguous case.
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed
    }
  } catch {
    // Not JSON — fall through to the remaining strategies.
  }

  // Still literally `{{ … }}`/`{% … %}` — evaluation never ran, or threw and
  // the evaluator's own catch fell back to the original raw text (see
  // `preview.ts`'s `evaluateStringValue`). Either way there is no real icon
  // list to show.
  if (hasTemplateSyntax(value)) {
    throw new Error(`Icon sequence "icons" template did not resolve to a list of icon names: "${value}"`)
  }

  // Nunjucks' default Array→String coercion for `{{ ['home', 'arrow-right'] }}`
  // is a comma-joined string ("home,arrow-right") — MDI icon names are plain
  // kebab-case with no commas, so splitting is safe and recovers the exact
  // list Home Assistant would have delivered natively.
  const commaSplit = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (commaSplit.length > 0) {
    return commaSplit
  }

  throw new Error('Icon sequence "icons" template resolved to an empty value')
}

export function renderIconSequence(
  element: IconSequenceElement,
  ctx: RenderContext,
): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const paintOptions = paintOptionsFromContext(ctx)
  const direction = resolveDirection(effectiveString(element, 'direction', 'right'))
  const size = effectiveFontSize(element, 'size', 20)
  const spacing = effectiveNumber(element, 'spacing', size / 4, 0)
  const icons = resolveIconSequenceIconNames(element.icons)
  const unknownIcon = icons.find((name) => resolveMdiPath(name) === null)
  if (unknownIcon !== undefined) {
    // Unknown icon name anywhere in the list fails the WHOLE element rather
    // than silently dropping just that one icon slot (issue #56) — consistent
    // with the no-partial-error-UX ruling: safeRenderElement replaces the
    // entire element with one render-error placeholder, never a mix of good
    // icons and a silently-invisible one.
    throw new Error(`Unknown Material Design icon name: "${unknownIcon}"`)
  }
  const { width, height } = iconSequenceBoxSize(size, icons.length, spacing, direction)
  const anchored = resolveAnchoredBox(
    effectiveString(element, 'anchor', ICON_DEFAULT_ANCHOR),
    resolveX(element.x, ctx),
    resolveY(element.y, ctx),
    width,
    height,
    ICON_DEFAULT_ANCHOR,
  )
  const positions = iconSequenceIconPositions(
    anchored.x,
    anchored.y,
    size,
    icons.length,
    spacing,
    direction,
  )

  return {
    layer: 'svg',
    primitive: {
      kind: 'icon_sequence',
      x: anchored.x,
      y: anchored.y,
      size,
      direction,
      spacing,
      fill: resolveIconPaint(element, 'fill', 'black', paintOptions),
      icons: icons.map((name, index) => ({
        name,
        path: resolveMdiPath(name),
        x: positions[index]!.x,
        y: positions[index]!.y,
      })),
    },
  }
}
