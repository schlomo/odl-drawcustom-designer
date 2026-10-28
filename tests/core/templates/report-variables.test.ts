import { describe, expect, it } from 'vitest'
import { evaluateTemplate, reportVariables } from '../../../src/core'
import { parseYamlPayload } from '../../../src/core/yaml'

/**
 * The map a host receives in `HostActionContext.variables` /
 * `HostPreviewContext.variables` (host-context variables slice): the
 * designer's shared variables at that instant, as the client-side template
 * preview injects them. Observable rules:
 *
 *  - values are the SAME typed values the preview substitutes (ADR-004):
 *    `"false"` is the boolean `false`, `"5"` the number 5, a plain word a
 *    string — a host feeding the map into its own template engine must agree
 *    with the preview on `{{ 'red' if alert else 'white' }}`;
 *  - a name the payload references but that holds no stored value is reported
 *    as `""` — what the Variables editor shows as an empty row;
 *  - a stored variable the payload does not reference is reported too — a host
 *    may render templates the scanner does not see;
 *  - a name the preview refuses to register (a reserved global such as `now`)
 *    is not reported either, so a host cannot be made to shadow its own;
 *  - the result is frozen, so a host cannot mutate what it was handed.
 */

const PAYLOAD = parseYamlPayload(
  [
    '- type: text',
    '  value: "{{ accent_color }}"',
    '  x: 10',
    '  y: 10',
    '- type: circle',
    '  x: 50',
    '  y: 50',
    '  radius: 10',
    '  fill: "{{ \'red\' if alert else \'white\' }}"',
    '',
  ].join('\n'),
)

describe('reportVariables', () => {
  it('reports stored values for every referenced name', () => {
    expect(reportVariables({ alert: 'true', accent_color: 'red' }, PAYLOAD)).toEqual({
      alert: true,
      accent_color: 'red',
    })
  })

  it('reports the typed values the preview injects, not the raw text', () => {
    const reported = reportVariables(
      { alert: 'false', count: '5', ratio: '0.5', label: 'red', list: '[1, 2]', nothing: 'none' },
      PAYLOAD,
    )
    expect(reported).toEqual({
      alert: false,
      count: 5,
      ratio: 0.5,
      label: 'red',
      list: [1, 2],
      nothing: null,
      accent_color: '',
    })
    expect(reported.alert).toBe(false)
    expect(reported.count).toBe(5)
  })

  it('agrees with the preview on a falsy "false" — the Load Demo circle', () => {
    const variables = { alert: 'false' }
    const preview = evaluateTemplate("{{ 'red' if alert else 'white' }}", {
      states: {},
      attributes: {},
      variables,
    })
    expect(preview).toBe('white')
    // A host that got the raw string "false" would render red: truthy.
    expect(reportVariables(variables, PAYLOAD).alert).toBe(false)
  })

  it('reports a referenced-but-unset name as the empty string', () => {
    expect(reportVariables({ accent_color: 'red' }, PAYLOAD)).toEqual({
      alert: '',
      accent_color: 'red',
    })
  })

  it('reports stored variables the payload does not reference', () => {
    expect(reportVariables({ alert: 'true', accent_color: 'red', unused: 'x' }, PAYLOAD)).toEqual({
      alert: true,
      accent_color: 'red',
      unused: 'x',
    })
  })

  it('does not report a stored name the preview refuses to register', () => {
    // `now` is a designer global; `collectVariableGlobals` drops it so the
    // preview's `now()` keeps working — the host must not be handed it either.
    expect(reportVariables({ now: 'noon', states: 'x', accent_color: 'red' }, PAYLOAD)).toEqual({
      alert: '',
      accent_color: 'red',
    })
  })

  it('reports an empty map for a payload without templates and no stored variables', () => {
    expect(reportVariables({}, parseYamlPayload('- type: text\n  value: Hello\n  x: 1\n  y: 1\n'))).toEqual({})
  })

  it('hands out a frozen map', () => {
    const reported = reportVariables({ accent_color: 'red' }, PAYLOAD)
    expect(Object.isFrozen(reported)).toBe(true)
    expect(() => {
      ;(reported as Record<string, unknown>).alert = 'true'
    }).toThrow()
  })
})
