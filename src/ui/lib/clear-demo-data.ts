import type { HaMockContext } from '../../core'
import type { StoredVariables } from '../../storage'
import type { MockEntityAttributes } from '../preferences/mockStates'
import {
  SHOWCASE_MOCK_ATTRIBUTES,
  SHOWCASE_MOCK_STATES,
  SHOWCASE_VARIABLES,
} from '../data/showcase'

/**
 * Removes only the showcase/demo-seeded State Simulator entries that the user
 * has NOT modified, so "Clear all" gives a clean slate without deleting mocks,
 * attributes, or variables the user added or changed themselves. An entry is
 * treated as demo data only when both its key and value still match the seeded
 * default; any user edit (different value) or user-added key is preserved.
 */

function valuesEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

export function clearDemoMockStates(
  states: HaMockContext['states'],
): HaMockContext['states'] {
  const result = { ...states }
  for (const [entityId, value] of Object.entries(SHOWCASE_MOCK_STATES)) {
    if (entityId in result && valuesEqual(result[entityId], value)) {
      delete result[entityId]
    }
  }
  return result
}

export function clearDemoMockAttributes(
  attributes: MockEntityAttributes,
): MockEntityAttributes {
  const result: MockEntityAttributes = {}
  for (const [entityId, attrs] of Object.entries(attributes)) {
    const demoAttrs = SHOWCASE_MOCK_ATTRIBUTES[entityId]
    if (!demoAttrs) {
      result[entityId] = attrs
      continue
    }
    const remaining: Record<string, unknown> = {}
    for (const [attribute, value] of Object.entries(attrs)) {
      if (attribute in demoAttrs && valuesEqual(value, demoAttrs[attribute])) {
        continue
      }
      remaining[attribute] = value
    }
    if (Object.keys(remaining).length > 0) {
      result[entityId] = remaining
    }
  }
  return result
}

export function clearDemoVariables(variables: StoredVariables): StoredVariables {
  const result = { ...variables }
  for (const [name, value] of Object.entries(SHOWCASE_VARIABLES)) {
    if (name in result && result[name] === value) {
      delete result[name]
    }
  }
  return result
}
