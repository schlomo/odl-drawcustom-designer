import type { Payload } from '../schema/payload'
import { scanPayloadForTemplates } from './scan'

/**
 * The shared variables as a host receives them in `HostActionContext.variables`
 * and `HostPreviewContext.variables` — the one builder behind both channels,
 * so an action and a preview request in the same state report the same map.
 *
 * Variables are reported *out* for rendering only (maintainer ruling
 * 2026-10-27): the designer's own template preview substitutes them, but they
 * never leave the browser on their own, so a host rendering the payload
 * without them answered `{{ 'red' if alert else 'white' }}` with white. The
 * rules, both of which a host can observe:
 *
 * - A name the payload references (`scanPayloadForTemplates(...).variablesReferenced`)
 *   with no stored value is reported as `""` — the empty row the Variables
 *   editor shows, and what the nunjucks preview renders for it.
 * - A stored variable the payload does not reference is reported too: a host
 *   may render templates the scanner does not see.
 *
 * Frozen, like `display` and `render`: the published type declares the field
 * `readonly`, so the object handed out is actually read-only.
 */
export function reportVariables(
  stored: Readonly<Record<string, string>>,
  payload: Payload,
): Readonly<Record<string, string>> {
  const reported: Record<string, string> = {}
  for (const name of scanPayloadForTemplates(payload).variablesReferenced) {
    reported[name] = ''
  }
  for (const [name, value] of Object.entries(stored)) {
    reported[name] = value
  }
  return Object.freeze(reported)
}
