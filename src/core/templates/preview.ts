import type { DrawElement } from '../schema/elements'
import type { Payload } from '../schema/payload'
import { normalizeDrawElement } from '../schema/normalizeElements'
import { evaluateTemplate } from './evaluate'
import { hasTemplateSyntax, walkStringValues } from './patterns'
import type { HaMockContext } from './types'

function evaluateStringValue(value: string, context: HaMockContext): string {
  if (!hasTemplateSyntax(value)) {
    return value
  }

  try {
    return evaluateTemplate(value, context)
  } catch {
    return value
  }
}

function applyContextToValue(value: unknown, context: HaMockContext): unknown {
  if (typeof value === 'string') {
    return evaluateStringValue(value, context)
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyContextToValue(item, context))
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      result[key] = applyContextToValue(nested, context)
    }
    return result
  }

  return value
}

/**
 * Whether any string anywhere in the element carries template syntax — i.e.
 * whether evaluating it against a context can yield anything but the element
 * itself.
 */
export function elementHasTemplates(element: DrawElement): boolean {
  let found = false
  walkStringValues(element, '', (raw) => {
    found ||= hasTemplateSyntax(raw)
  })
  return found
}

/**
 * Evaluates one element's template strings for preview — the whole of a
 * payload evaluation for that element, since fields are evaluated
 * independently (see {@link applyTemplateContextToPayload}) and normalization
 * is per element.
 *
 * An element WITHOUT templates is returned as-is (normalized): nothing to
 * substitute means nothing to copy, and callers that memoize on element
 * identity — the canvas element slots, the layer list rows — then keep their
 * memo across an edit elsewhere in the payload (issue #124: a canvas drag
 * deep-cloned all 22 demo elements on every pointermove to move one).
 */
export function applyTemplateContextToElement(
  element: DrawElement,
  context: HaMockContext,
): DrawElement {
  if (!elementHasTemplates(element)) {
    return normalizeDrawElement(element)
  }
  return normalizeDrawElement(applyContextToValue(element, context) as DrawElement)
}

/**
 * Returns the payload with template strings evaluated for preview. Each
 * templated field is evaluated INDEPENDENTLY — `{% set %}` / `namespace()`
 * side effects do NOT carry across fields, matching how Home Assistant renders
 * service-data (each string is wrapped as its own `Template` and rendered
 * separately; see ADR-004). Cross-field value sharing is done via user-defined
 * Simulator variables, injected through `context.variables`.
 *
 * Elements are likewise independent of one another, which is what makes the
 * per-element entry point above equivalent to this one, element for element.
 * The array is always new; template-free elements within it are the caller's
 * own objects (see {@link applyTemplateContextToElement}) — the result is read
 * as immutable data, never mutated in place.
 */
export function applyTemplateContextToPayload(
  payload: Payload,
  context: HaMockContext,
): Payload {
  return payload.map((element) => applyTemplateContextToElement(element, context))
}
