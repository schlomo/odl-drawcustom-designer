import nunjucks from 'nunjucks'
import { attributeValueEquals, coerceAttributeValue } from './attribute-values'
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

/**
 * HA-parity placeholder for a missing entity. In Home Assistant,
 * `states.<domain>.<object>` on an unknown entity yields Python `None`:
 * printing it outputs `None`, and touching ANY attribute raises
 * `UndefinedError: 'None' has no attribute '<name>'`. Nunjucks instead
 * resolves undefined chains silently, so a missing entity previewed as an
 * empty string while HA blew up at send time (WYSIWYG violation, live
 * incident). This proxy reproduces HA: string-coerces to `None`, throws the
 * HA-shaped message on template-authored member access, and stays inert for
 * the probes the JS runtime / nunjucks make on values they merely pass along
 * (symbols, `toString`/`valueOf` for coercion, `then` promise sniffing).
 *
 * Documented divergences from HA (cheap-to-match cases are matched; these
 * are not reachable without replacing nunjucks' value model):
 *   - `states.weather.home == none` and `… is none` are false here (a JS
 *     object can never equal null); HA's None == none / is none are True.
 *   - `{% if states.weather.home %}` is truthy here; HA's None is falsy.
 *   - jinja-compat dict helpers (`.items`, `.get`, …) are intercepted by
 *     nunjucks before this proxy sees them, so they do not raise.
 *   `is defined` matches HA (true — None is defined).
 */
const missingEntityNone = new Proxy(Object.create(null) as Record<string, unknown>, {
  get(_target, key) {
    if (typeof key === 'symbol') {
      return key === Symbol.toPrimitive ? () => 'None' : undefined
    }
    if (key === 'toString' || key === 'valueOf') {
      return () => 'None'
    }
    if (key === 'then') {
      return undefined
    }
    throw new Error(`'None' has no attribute '${key}'`)
  },
  // Member assignment onto None is meaningless; swallow it instead of letting
  // a rewritten `{% set %}` define properties on the shared placeholder.
  set() {
    return true
  },
})

type DomainBucket = Record<string, HaStateObject>

/**
 * Wrap a domain's entity map so a missing `object_id` resolves to the None
 * placeholder instead of `undefined` — in HA, `states.<domain>` is always a
 * namespace and only the ENTITY lookup yields None. Unsafe keys resolve to
 * the placeholder too (inert: it only prints or raises).
 */
function createDomainBucket(entries: DomainBucket): DomainBucket {
  return new Proxy(entries, {
    get(target, key) {
      if (typeof key === 'symbol') {
        // Rendering a domain itself (`{{ states.weather }}`) is not an error
        // in HA; print a stable tag instead of a JS coercion TypeError.
        return key === Symbol.toPrimitive ? () => '<DomainStates>' : undefined
      }
      if (key in target) {
        return target[key]
      }
      return missingEntityNone
    },
    set() {
      return true
    },
  })
}

/** Shared bucket for domains with no mocked entities (`states.nosuchdomain`). */
const emptyDomainBucket = createDomainBucket(Object.create(null) as DomainBucket)

// Function members nunjucks itself needs on the callable `states` global
// (`callWrap` invokes `obj.apply`); these mirror the domain names
// `buildStatesGlobal` already refuses to materialize.
function isFunctionMemberKey(key: string): boolean {
  return key in Function.prototype || key === 'name' || key === 'length'
}

function buildStatesGlobal(context: HaMockContext): StatesGlobal {
  const statesFn = ((entityId: string) => getStateValue(context, entityId)) as StatesGlobal

  const entityIds = new Set<string>([
    ...Object.keys(context.states),
    ...Object.keys(context.attributes ?? {}),
  ])

  const domains = new Map<string, DomainBucket>()

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
    if (isFunctionMemberKey(domain)) {
      continue
    }
    // Null-prototype buckets so dotted lookups (`states.<domain>.<object>`)
    // can never reach Object.prototype members.
    let bucket = domains.get(domain)
    if (bucket === undefined) {
      bucket = Object.create(null) as DomainBucket
      domains.set(domain, bucket)
    }
    bucket[objectId] = {
      entity_id: entityId,
      state: getStateValue(context, entityId),
      attributes: { ...(context.attributes?.[entityId] ?? {}) },
    }
  }

  const buckets = new Map<string, DomainBucket>()
  for (const [domain, entries] of domains) {
    buckets.set(domain, createDomainBucket(entries))
  }

  // Proxy so EVERY domain name resolves to a namespace (HA: `states.<domain>`
  // always exists; only the entity lookup yields None). Unsafe keys stay
  // inert (`states.constructor` is undefined — previously it leaked a bound
  // Function wrapper via nunjucks' memberLookup), and the function members
  // nunjucks needs to CALL `states('entity.id')` pass through.
  return new Proxy(statesFn, {
    get(target, key, receiver) {
      if (typeof key === 'symbol') {
        return Reflect.get(target, key, receiver)
      }
      if (UNSAFE_KEYS.has(key)) {
        return undefined
      }
      const bucket = buckets.get(key)
      if (bucket !== undefined) {
        return bucket
      }
      if (isFunctionMemberKey(key)) {
        return Reflect.get(target, key, receiver)
      }
      return emptyDomainBucket
    },
    set() {
      return true
    },
  }) as StatesGlobal
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
 * literal entity states and typed attributes (ADR-004). They are NOT rendered
 * as templates (Home Assistant renders script `variables:` once at the
 * automation level and never re-parses the rendered output), so a value that
 * happens to contain `{{ … }}` is emitted as-is.
 *
 * HA renders `variables:` with `parse_result=True`, so a variable's resolved
 * value carries its NATIVE type (bool / int / float / dict / list) into the
 * downstream templates that reference it — it is NOT always a string. We mirror
 * that by inferring the literal type from the user's text with the SAME rules
 * as mock attribute values (`coerceAttributeValue`): `"false"` becomes the
 * boolean `false` (falsy, unlike the truthy string), `"5"` becomes the number
 * `5`, JSON arrays/objects parse to lists/dicts, and a plain word stays a
 * string. Type inference never re-renders the value, so a `{{ … }}`-looking
 * string is kept verbatim.
 */
function collectVariableGlobals(context: HaMockContext): Record<string, unknown> {
  const variables = context.variables
  if (!variables) {
    return {}
  }

  const globals: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(variables)) {
    if (isValidVariableName(name)) {
      globals[name] = coerceAttributeValue(value)
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
