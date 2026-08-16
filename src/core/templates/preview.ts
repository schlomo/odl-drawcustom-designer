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
 * Freezes `value` under `import.meta.env.DEV` only — a dev/test guard rail,
 * not shipped behavior. Vite statically replaces `import.meta.env.DEV` with
 * `false` for a production `vite build` (both the app build and
 * `build:lib`), so the `if` and the `Object.freeze` call are dead code the
 * minifier strips; Vitest's default test mode leaves it `true`. Shallow
 * freeze is enough — the contract this guards is top-level property
 * reassignment on the returned element.
 */
function freezeInDev<T extends object>(value: T): T {
  if (import.meta.env.DEV) {
    Object.freeze(value)
  }
  return value
}

/**
 * Evaluates one element's template strings for preview — the whole of a
 * payload evaluation for that element, since fields are evaluated
 * independently (see {@link applyTemplateContextToPayload}) and normalization
 * is per element.
 *
 * An element WITHOUT templates whose normalization is a no-op is returned
 * as-is: nothing to substitute and nothing to normalize means nothing to
 * copy, and callers that memoize on element identity — the canvas element
 * slots, the layer list rows — then keep their memo across an edit elsewhere
 * in the payload (issue #124: a canvas drag deep-cloned all 22 demo elements
 * on every pointermove to move one). An icon element still carrying the
 * legacy `color` field is the one template-free exception: normalization
 * migrates it to `fill` and returns a fresh clone — see
 * {@link normalizeDrawElement}, `normalizeIconElement` — so its preview does
 * NOT share identity with the source element, and that clone is not frozen.
 *
 * The as-is return DOES alias the source `elements` array's own object, so a
 * mutating consumer would corrupt stored state, not just a throwaway
 * preview — `Object.freeze` in dev/test (see {@link freezeInDev}) turns an
 * accidental mutation into a thrown error instead of silent corruption.
 */
export function applyTemplateContextToElement(
  element: DrawElement,
  context: HaMockContext,
): DrawElement {
  if (!elementHasTemplates(element)) {
    const normalized = normalizeDrawElement(element)
    return normalized === element ? freezeInDev(normalized) : normalized
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
 * The array is always new; a template-free element within it that also needed
 * no normalization is the caller's own object (see
 * {@link applyTemplateContextToElement} for the legacy-color-icon exception)
 * — the result is read as immutable data, never mutated in place.
 */
export function applyTemplateContextToPayload(
  payload: Payload,
  context: HaMockContext,
): Payload {
  return payload.map((element) => applyTemplateContextToElement(element, context))
}
