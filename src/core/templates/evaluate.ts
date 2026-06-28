import nunjucks from 'nunjucks'
import { createHaDateTime } from './ha-datetime'
import { haFloat, haIif } from './ha-globals'
import type { HaMockContext } from './types'

let jinjaCompatInstalled = false

function ensureJinjaCompat(): void {
  if (jinjaCompatInstalled) {
    return
  }
  nunjucks.installJinjaCompat()
  jinjaCompatInstalled = true
}

function getStateValue(context: HaMockContext, entityId: string): string {
  const value = context.states[entityId]
  if (value === undefined) {
    return 'unknown'
  }
  return String(value)
}

function isEntityState(context: HaMockContext, entityId: string, state: string): boolean {
  return getStateValue(context, entityId).toLowerCase() === state.toLowerCase()
}

function getStateAttribute(context: HaMockContext, entityId: string, attribute: string): unknown {
  const value = context.attributes?.[entityId]?.[attribute]
  // HA returns None (falsy) for missing attributes; mirror with null so
  // `iif(state_attr(...), …)` and truthiness checks behave like Home Assistant.
  return value === undefined ? null : value
}

/** State object exposed via dotted access, e.g. `states.weather.home`. */
interface HaStateObject {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
}

/**
 * Callable `states('entity_id')` global that is ALSO subscriptable as
 * `states.<domain>.<object_id>` so both HA access forms work:
 *   - `states('weather.home')` → state string (existing behavior)
 *   - `states.weather.home.attributes.temperature` → attribute value
 * The domain → object_id structure is materialized per evaluation from the
 * mock context (both `states` and `attributes` entity ids contribute).
 */
type StatesGlobal = ((entityId: string) => string) &
  Record<string, Record<string, HaStateObject>>

// Entity-id segments that must never be used as object keys: assigning them
// would mutate the prototype chain (`__proto__`) or shadow built-in members,
// enabling prototype pollution from user-controlled entity ids.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function buildStatesGlobal(context: HaMockContext): StatesGlobal {
  const statesFn = ((entityId: string) => getStateValue(context, entityId)) as StatesGlobal

  const entityIds = new Set<string>([
    ...Object.keys(context.states),
    ...Object.keys(context.attributes ?? {}),
  ])

  for (const entityId of entityIds) {
    const dot = entityId.indexOf('.')
    if (dot <= 0 || dot >= entityId.length - 1) {
      continue
    }
    const domain = entityId.slice(0, dot)
    const objectId = entityId.slice(dot + 1)
    // Reject keys that would pollute prototypes via dotted access (e.g.
    // `sensor.__proto__`, `__proto__.x`, `constructor`, `prototype`).
    if (UNSAFE_KEYS.has(domain) || UNSAFE_KEYS.has(objectId)) {
      continue
    }
    // Skip domains that would clash with Function's own non-writable members.
    if (domain in Function.prototype || domain === 'name' || domain === 'length') {
      continue
    }
    // Null-prototype buckets so dotted lookups (`states.<domain>.<object>`)
    // can never reach Object.prototype members.
    let bucket = statesFn[domain]
    if (bucket === undefined) {
      bucket = Object.create(null) as Record<string, HaStateObject>
      statesFn[domain] = bucket
    }
    bucket[objectId] = {
      entity_id: entityId,
      state: getStateValue(context, entityId),
      attributes: { ...(context.attributes?.[entityId] ?? {}) },
    }
  }

  return statesFn
}

function createEnvironment(context: HaMockContext): nunjucks.Environment {
  ensureJinjaCompat()

  const env = new nunjucks.Environment(null, {
    autoescape: false,
    throwOnUndefined: false,
  })

  env.addGlobal('states', buildStatesGlobal(context))
  env.addGlobal('is_state', (entityId: string, state: string) =>
    isEntityState(context, entityId, state),
  )
  env.addGlobal('state_attr', (entityId: string, attribute: string) =>
    getStateAttribute(context, entityId, attribute),
  )
  env.addGlobal('now', () => createHaDateTime(context.now ?? new Date()))
  env.addGlobal('float', haFloat)
  env.addGlobal('iif', haIif)

  return env
}

export class TemplateEvaluationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'TemplateEvaluationError'
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

export function evaluateTemplate(template: string, context: HaMockContext): string {
  if (!template.includes('{{') && !template.includes('{%')) {
    return template
  }

  try {
    return createEnvironment(context).renderString(template, {})
  } catch (error) {
    throw new TemplateEvaluationError(
      error instanceof Error ? error.message : 'Template evaluation failed',
      error,
    )
  }
}
