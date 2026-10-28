import { coerceAttributeValue } from './attribute-values'

/** The nunjucks global the `set_attr` rewrite targets — reserved like the rest. */
export const SET_ATTR_GLOBAL = '__ha_setattr'

/** Globals the evaluator registers itself — a user variable may not shadow these. */
export const RESERVED_VARIABLE_NAMES: ReadonlySet<string> = new Set([
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

/** A user variable name must be a bare, unreserved identifier so `{{ name }}` resolves. */
export function isValidVariableName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name) && !RESERVED_VARIABLE_NAMES.has(name)
}

/**
 * A shared variable's typed value as the preview injects it: what
 * {@link coerceAttributeValue} produces from the stored text — JSON-native
 * scalars, or a parsed JSON array/object. Nothing else can appear, so a host
 * can hand the map straight to its own template engine.
 */
export type VariableValue =
  | string
  | number
  | boolean
  | null
  | readonly VariableValue[]
  | { readonly [key: string]: VariableValue }

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
 *
 * The ONE place stored text becomes typed globals: the evaluator registers
 * exactly this map, and `reportVariables` hands exactly this map to a host —
 * so `{{ 'red' if alert else 'white' }}` cannot be white in the designer and
 * red on the display. Reserved names are dropped here, for both.
 */
export function collectVariableGlobals(
  variables: Readonly<Record<string, string>> | undefined,
): Record<string, VariableValue> {
  const globals: Record<string, VariableValue> = {}
  if (!variables) {
    return globals
  }
  for (const [name, value] of Object.entries(variables)) {
    if (isValidVariableName(name)) {
      // `coerceAttributeValue` yields only JSON-native values (its JSON branch
      // is `JSON.parse`), which is exactly `VariableValue`.
      globals[name] = coerceAttributeValue(value) as VariableValue
    }
  }
  return globals
}
