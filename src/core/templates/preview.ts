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

/** Returns a deep copy of the payload with template strings evaluated for preview. */
export function applyTemplateContextToPayload(
  payload: Payload,
  context: HaMockContext,
): Payload {
  const evaluated = applyContextToValue(payload, context) as Payload
  return normalizePayload(evaluated)
}
