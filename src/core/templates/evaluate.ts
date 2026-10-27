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

/**
 * Jinja-parity deferred undefined. In Python Jinja2 (and therefore HA's
 * default printable `LoggingUndefined`, measured against HA 2026.8.3 /
 * jinja2 3.1.6), attribute access on None does not raise at the access
 * itself — it returns an `Undefined` object CARRYING the message
 * `'None' has no attribute '<name>'` that:
 *
 *   - STRINGIFIES to the empty string — `{{ missing.state }}` renders '' in
 *     HA (a send succeeds with blank text and a log warning), and so do
 *     concat, `| upper`, `== 'on'` (False) and friends. Throwing here was the
 *     INVERSE WYSIWYG violation: our preview blocked templates HA sends fine.
 *   - raises only on FURTHER dereference (`Undefined.__getattr__` re-raises
 *     the carried message) — that is the real incident
 *     (`{{ missing.attributes.humidity }}`), and the wrapped `memberLookup`
 *     in {@link ensureJinjaCompat} keeps throwing it verbatim. That wrapper
 *     also keeps `.constructor`/`.__proto__` from ever reaching
 *     Function/Object.prototype through a sentinel.
 *   - `| default(...)` consumes it and `is defined` on it is false (filter
 *     and test overrides below).
 *
 * Ruling: preview errors only where a send would error; where HA renders
 * blank, preview renders blank.
 *
 * Extending `String` with the empty string is what makes coercion total:
 * nunjucks string filters call methods DIRECTLY (`val.toUpperCase()`), so a
 * plain object coercing to '' would still crash them. An empty String wrapper
 * answers every string filter with '' (HA: ''), `| length` with 0 (HA: '0'),
 * and `| list` with the empty sequence (HA: '[]'). The carried message is a
 * frozen NON-enumerable own property so object-shaped filters see an empty
 * object. Instances are frozen: one hidden message and nothing else.
 */
class HaUndefined extends String {
  declare readonly haMessage: string

  constructor(haMessage: string) {
    super('')
    Object.defineProperty(this, 'haMessage', { value: haMessage, enumerable: false })
    Object.freeze(this)
  }

  override toString(): string {
    return ''
  }

  override valueOf(): string {
    return ''
  }
}

/** The runtime half of nunjucks that `installJinjaCompat` monkey-patches. */
interface NunjucksRuntimeInternals {
  memberLookup: (...args: unknown[]) => unknown
}

/**
 * `Environment.addTest` ships in nunjucks 3 (`environment.js`) but is missing
 * from `@types/nunjucks`; type only the slice we call.
 */
type EnvironmentWithTests = nunjucks.Environment & {
  addTest(name: string, test: (value: unknown) => boolean): void
}

let jinjaCompatInstalled = false

/**
 * Installs nunjucks' Jinja compat layer once, then wraps the compat
 * `memberLookup` so member access matches Jinja's None semantics:
 *
 *   - lookup on `null` (a missing entity, or any template-level None) returns
 *     a deferred {@link HaUndefined} named after that FIRST missing hop;
 *   - lookup on a deferred undefined raises its carried message (Jinja:
 *     `Undefined.__getattr__` re-raises), so chained hops keep the first name.
 *
 * The wrapper sits AFTER `installJinjaCompat` deliberately: compat's own
 * lookup coalesces `null` to `{}` and would answer dict helpers (`.items`,
 * `.get`, …) on None silently; wrapping outside it means None member access
 * always defers-then-raises like HA instead.
 *
 * The patch is global to the nunjucks runtime (that is how jinja compat
 * itself works) but carries no state: sentinels are per-lookup values, so
 * nothing leaks across evaluations or environments.
 */
function ensureJinjaCompat(): void {
  if (jinjaCompatInstalled) {
    return
  }
  nunjucks.installJinjaCompat()
  const runtime = (nunjucks as unknown as { runtime: NunjucksRuntimeInternals }).runtime
  const compatMemberLookup = runtime.memberLookup
  runtime.memberLookup = function patchedMemberLookup(this: unknown, ...args: unknown[]): unknown {
    // Four arguments is jinja-compat's slice form (`list[1:2]`), not member
    // access — pass it through untouched.
    if (args.length !== 4) {
      const [target, key] = args
      if (target instanceof HaUndefined) {
        throw new Error(target.haMessage)
      }
      if (target === null) {
        return new HaUndefined(`'None' has no attribute '${String(key)}'`)
      }
    }
    return compatMemberLookup.apply(this, args)
  }
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

type DomainBucket = Record<string, HaStateObject>

/**
 * Wrap a domain's entity map so a missing `object_id` resolves to `null` — the
 * jinja-compat None — instead of `undefined`. In HA, `states.<domain>` is
 * always a namespace and only the ENTITY lookup yields None. With None a real
 * `null`, the HA guard idioms hold for free: `{% if states.weather.home %}`
 * skips, `== none` / `is none` match, `is defined` is true (HA: None is
 * defined), and only member access produces the deferred {@link HaUndefined}
 * via the wrapped `memberLookup` — which raises `'None' has no attribute
 * '<name>'` exactly when HA would. Unsafe keys (`__proto__`, …) resolve to
 * `null` too: inert, and never a prototype walk.
 *
 * Documented divergences from HA (not reachable without replacing nunjucks'
 * value model; maintainer-accepted, each measured on HA 2026.8.3 — pinned in
 * tests/core/templates/missing-entity.test.ts):
 *   - `{{ states.weather.home }}` renders '' here; HA prints `None` (nunjucks
 *     suppresses null in output).
 *   - A deferred undefined used as a bare truthiness guard
 *     (`{{ 'x' if states.weather.home.state else 'y' }}`) is truthy here
 *     (JS object); HA's Undefined is falsy — silent wrong branch, rare.
 *     Guarding the ENTITY (`if states.weather.home`), `== 'on'`,
 *     `is defined`, and `| default(...)` all match HA.
 *   - `{% for f in states.weather.home %}` renders '' here; HA raises
 *     `TypeError: 'NoneType' object is not iterable`.
 *   - Numeric contexts on a deferred undefined coerce instead of raising:
 *     `{{ states.weather.home.state > 5 }}` → 'false' and `| int(0)` → '0'
 *     here; HA raises UndefinedError for both. More lenient, never a false
 *     error. `.items()` on a missing entity likewise throws nunjucks'
 *     not-a-function error rather than HA's exact text (loud either way).
 *   - Arithmetic on a string coerces here (`'42' / 60` → 0.7, JS
 *     semantics); HA raises `TypeError: unsupported operand type(s) for /:
 *     'str' and 'int'` (observed on a live send: the showcase progress bar
 *     once divided a `strftime('%S')` result). A template that previews
 *     fine here can still fail on the real device — cast with `| int` /
 *     `| float` or use numeric attributes (`now().second`) in payloads.
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
      return null
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

/**
 * Nunjucks' stock `default` only replaces `undefined`; the deferred
 * {@link HaUndefined} is a real object, so it must be consumed explicitly
 * (Jinja: `Undefined | default(x)` → x). Everything else keeps stock behavior,
 * including the optional truthiness flag.
 */
function haDefaultFilter(value: unknown, defaultValue: unknown, truthiness?: boolean): unknown {
  if (value instanceof HaUndefined) {
    return defaultValue
  }
  if (truthiness) {
    return value || defaultValue
  }
  return value !== undefined ? value : defaultValue
}

function createEnvironment(context: HaMockContext): nunjucks.Environment {
  ensureJinjaCompat()

  const env = new nunjucks.Environment(null, {
    autoescape: false,
    throwOnUndefined: false,
  })

  // Jinja-parity handling of the deferred undefined: `default` consumes it
  // (`d` is a separate alias entry in nunjucks' filter table, so it is
  // overridden explicitly), `defined`/`undefined` classify it as undefined,
  // and `none` (a Jinja test nunjucks lacks — it only ships `null`) matches
  // the missing entity's None.
  env.addFilter('default', haDefaultFilter)
  env.addFilter('d', haDefaultFilter)
  const testableEnv = env as EnvironmentWithTests
  testableEnv.addTest(
    'defined',
    (value: unknown) => !(value instanceof HaUndefined) && value !== undefined,
  )
  testableEnv.addTest(
    'undefined',
    (value: unknown) => value instanceof HaUndefined || value === undefined,
  )
  testableEnv.addTest('none', (value: unknown) => value === null)

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
