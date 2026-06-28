import type { Payload } from '../schema/payload'
import { normalizePayload } from '../schema/normalizeElements'
import { evaluateTemplate } from './evaluate'
import { hasTemplateSyntax } from './patterns'
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
 * Returns a deep copy of the payload with template strings evaluated for
 * preview. Each templated field is evaluated INDEPENDENTLY — `{% set %}` /
 * `namespace()` side effects do NOT carry across fields, matching how Home
 * Assistant renders service-data (each string is wrapped as its own `Template`
 * and rendered separately; see ADR-004). Cross-field value sharing is done via
 * user-defined Simulator variables, injected through `context.variables`.
 */
export function applyTemplateContextToPayload(
  payload: Payload,
  context: HaMockContext,
): Payload {
  const evaluated = applyContextToValue(payload, context) as Payload
  return normalizePayload(evaluated)
}
