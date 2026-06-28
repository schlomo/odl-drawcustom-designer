import nunjucks from 'nunjucks'
import { attributeValueEquals } from './attribute-values'
import { createHaDateTime } from './ha-datetime'
import { haFloat, haIif, haNamespace, haSetAttr } from './ha-globals'
import type { HaMockContext } from './types'

/** Internal global name backing rewritten `{% set ns.member = … %}` assignments. */
const SET_ATTR_GLOBAL = '__ha_setattr'

/**
 * Nunjucks does not parse member-target assignment (`{% set ns.uv = value %}`),
 * which Jinja allows for `namespace()` objects. Rewrite that single, well-scoped
 * pattern into an expression that mutates the object in place:
 *
 *   {% set ns.uv = expr %}  →  {{ __ha_setattr(ns, 'uv', expr) }}
 *
 * Plain `{% set x = … %}` (no member) is left untouched. Only a single-level
 * member target (`obj.member`) is supported — the minimum needed for the HA
 * `namespace()` pattern reported in issue #5.
 */
function rewriteNamespaceMemberAssignments(template: string): string {
  const memberSet =
    /\{%(-)?\s*set\s+([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?)\s*(-)?%\}/g
  return template.replace(
    memberSet,
    (
      _match,
      trimStart: string | undefined,
      object: string,
      member: string,
      expression: string,
      trimEnd: string | undefined,
    ) =>
      `{{${trimStart ?? ''} ${SET_ATTR_GLOBAL}(${object}, '${member}', ${expression}) ${trimEnd ?? ''}}}`,
  )
}

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

/**
 * HA `is_state_attr(entity, attribute, value)` — true iff the entity's typed
 * attribute equals `value`. Type-sensitive: boolean `false` does not match the
 * string `"false"`. A missing attribute is treated as `None` (null), so
 * `is_state_attr(e, 'missing', None)` is true.
 */
function isStateAttribute(
  context: HaMockContext,
  entityId: string,
  attribute: string,
  value: unknown,
): boolean {
  return attributeValueEquals(getStateAttribute(context, entityId, attribute), value)
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

/** Globals we register ourselves — a user variable may not shadow these. */
const RESERVED_VARIABLE_NAMES = new Set([
  'states',
  'is_state',
  'state_attr',
  'is_state_attr',
  'now',
  'float',
  'iif',
  'namespace',
  SET_ATTR_GLOBAL,
])

/** A user variable name must be a bare identifier so `{{ name }}` resolves. */
function isValidVariableName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name) && !RESERVED_VARIABLE_NAMES.has(name)
}

/**
 * User-defined variables are LITERAL mock values — the resolved runtime value
 * the user wants during preview, consistent with how the State Simulator mocks
 * literal entity states and typed attributes (ADR-004). Values are injected
 * VERBATIM as Nunjucks globals; they are NOT rendered as templates (Home
 * Assistant renders script `variables:` once at the automation level and never
 * re-parses the rendered output, so the simulator captures the resolved
 * literal). A value that happens to contain `{{ … }}` is emitted as-is.
 */
function collectVariableGlobals(context: HaMockContext): Record<string, string> {
  const variables = context.variables
  if (!variables) {
    return {}
  }

  const globals: Record<string, string> = {}
  for (const [name, value] of Object.entries(variables)) {
    if (isValidVariableName(name)) {
      globals[name] = value
    }
  }
  return globals
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
  env.addGlobal('is_state_attr', (entityId: string, attribute: string, value: unknown) =>
    isStateAttribute(context, entityId, attribute, value),
  )
  env.addGlobal('now', () => createHaDateTime(context.now ?? new Date()))
  env.addGlobal('float', haFloat)
  env.addGlobal('iif', haIif)
  env.addGlobal('namespace', haNamespace)
  env.addGlobal(SET_ATTR_GLOBAL, haSetAttr)

  for (const [name, value] of Object.entries(collectVariableGlobals(context))) {
    env.addGlobal(name, value)
  }

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
    const prepared = rewriteNamespaceMemberAssignments(template)
    return createEnvironment(context).renderString(prepared, {})
  } catch (error) {
    throw new TemplateEvaluationError(
      error instanceof Error ? error.message : 'Template evaluation failed',
      error,
    )
  }
}
