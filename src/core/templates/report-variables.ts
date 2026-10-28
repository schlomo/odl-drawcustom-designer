import type { Payload } from '../schema/payload'
import { scanPayloadForTemplates } from './scan'
import { collectVariableGlobals, type VariableValue } from './variable-globals'

/**
 * The shared variables as a host receives them in `HostActionContext.variables`
 * and `HostPreviewContext.variables` — the one builder behind both channels,
 * so an action and a preview request in the same state report the same map.
 *
 * Variables are reported *out* for rendering only (maintainer ruling
 * 2026-10-27): the designer's own template preview substitutes them, but they
 * never leave the browser on their own, so a host rendering the payload
 * without them answered `{{ 'red' if alert else 'white' }}` with white. The
 * rules, all of which a host can observe:
 *
 * - Values are the SAME typed values the preview injects
 *   ({@link collectVariableGlobals}, ADR-004): `"false"` is the boolean
 *   `false`, `"5"` the number 5, a plain word a string. Reporting the raw text
 *   would make that circle white in the designer and red on the display.
 * - A name the preview refuses to register (a reserved global such as `now`)
 *   is not reported either — same helper, same set.
 * - A name the payload references (`scanPayloadForTemplates(...).variablesReferenced`)
 *   with no stored value is reported as `""` — the empty row the Variables
 *   editor shows. (Pending maintainer decision: omit instead, so a strict host
 *   render raises "x is undefined" like HA's engine does.)
 * - A stored variable the payload does not reference is reported too: a host
 *   may render templates the scanner does not see.
 *
 * Frozen, like `display` and `render`: the published type declares the field
 * `readonly`, so the object handed out is actually read-only.
 */
export function reportVariables(
  stored: Readonly<Record<string, string>>,
  payload: Payload,
): Readonly<Record<string, VariableValue>> {
  const reported: Record<string, VariableValue> = {}
  for (const name of scanPayloadForTemplates(payload).variablesReferenced) {
    reported[name] = ''
  }
  Object.assign(reported, collectVariableGlobals(stored))
  return Object.freeze(reported)
}
