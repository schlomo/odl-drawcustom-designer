import { describe, expect, it } from 'vitest'
import { reportVariables } from '../../../src/core'
import { parseYamlPayload } from '../../../src/core/yaml'

/**
 * The map a host receives in `HostActionContext.variables` /
 * `HostPreviewContext.variables` (host-context variables slice): the
 * designer's shared variables at that instant, as the client-side template
 * preview sees them. Observable rules:
 *
 *  - a name the payload references but that holds no stored value is reported
 *    as `""` — what the Variables editor shows as an empty row and what the
 *    nunjucks preview substitutes;
 *  - a stored variable the payload does not reference is reported too — a host
 *    may render templates the scanner does not see;
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
      alert: 'true',
      accent_color: 'red',
    })
  })

  it('reports a referenced-but-unset name as the empty string', () => {
    expect(reportVariables({ accent_color: 'red' }, PAYLOAD)).toEqual({
      alert: '',
      accent_color: 'red',
    })
  })

  it('reports stored variables the payload does not reference', () => {
    expect(reportVariables({ alert: 'true', accent_color: 'red', unused: 'x' }, PAYLOAD)).toEqual({
      alert: 'true',
      accent_color: 'red',
      unused: 'x',
    })
  })

  it('reports an empty map for a payload without templates and no stored variables', () => {
    expect(reportVariables({}, parseYamlPayload('- type: text\n  value: Hello\n  x: 1\n  y: 1\n'))).toEqual({})
  })

  it('hands out a frozen map', () => {
    const reported = reportVariables({ accent_color: 'red' }, PAYLOAD)
    expect(Object.isFrozen(reported)).toBe(true)
    expect(() => {
      ;(reported as Record<string, string>).alert = 'true'
    }).toThrow()
  })
})
