import { safeRenderElement, type DrawElement, type RenderContext } from '../../core'
import type { StatusMessage } from './status-messages'

export interface ElementRenderError {
  /** Zero-based index into the elements array. */
  index: number
  message: string
}

/**
 * Elements whose renderer threw during this render pass. `safeRenderElement`
 * never returns null for a real failure anymore (see issue #10) — it tags the
 * placeholder RenderResult with `.error` instead. This collects those so the
 * UI can surface a visible status message alongside the placeholder outline.
 */
export function collectElementRenderErrors(
  elements: readonly DrawElement[],
  ctx: RenderContext,
): ElementRenderError[] {
  const errors: ElementRenderError[] = []

  elements.forEach((element, index) => {
    const result = safeRenderElement(element, ctx)
    if (result?.error) {
      errors.push({ index, message: result.error })
    }
  })

  return errors
}

export function getRenderErrorStatusMessages(
  elements: readonly DrawElement[],
  ctx: RenderContext,
): StatusMessage[] {
  return collectElementRenderErrors(elements, ctx).map(({ index, message }) => ({
    severity: 'error' as const,
    title: 'Element failed to render',
    summary: `Element ${index + 1} could not be rendered: ${message}`,
    detail:
      'Showing a placeholder outline at its position instead of hiding it. Check its properties (e.g. font) and fix or remove the element.',
  }))
}
