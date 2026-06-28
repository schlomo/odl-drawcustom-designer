import { describe, expect, it } from 'vitest'
import { extractVariableReferences, scanPayloadForTemplates } from '../../../src/core'
import { parseYamlPayload } from '../../../src/core/yaml'

// Auto-population: the State Simulator pre-fills empty-valued rows for variables
// referenced in the payload (mirrors attribute pre-fill). The scanner must find
// bare identifiers that are NOT HA globals, entity-id args, function calls,
// filters, member-access roots, or local `{% set %}` / `{% for %}` names.
describe('extractVariableReferences', () => {
  it('detects a bare variable reference', () => {
    expect(extractVariableReferences('{{ uv_fill }}')).toEqual(['uv_fill'])
  })

  it('detects variables used inside expressions', () => {
    expect(extractVariableReferences("{{ iif(is_state('x.y', 'on'), label, fallback) }}").sort()).toEqual(
      ['fallback', 'label'],
    )
  })

  it('ignores HA globals and their entity-id string args', () => {
    expect(
      extractVariableReferences("{{ states('sensor.temp') }} {{ state_attr('sensor.t', 'foo') }}"),
    ).toEqual([])
  })

  it('ignores now/float/iif/namespace globals (but keeps the piped value)', () => {
    // `now` and `float` are globals/filters; `value` is a genuine variable input.
    expect(extractVariableReferences('{{ now() }} {{ value | float(0) }}')).toEqual(['value'])
  })

  it('ignores function calls and filters', () => {
    // `round` is a filter, `len` is a call → neither is a scalar variable.
    expect(extractVariableReferences('{{ amount | round(1) }}').sort()).toEqual(['amount'])
  })

  it('ignores within-field {% set %} locals', () => {
    expect(
      extractVariableReferences("{% set tmp = 'x' %}{{ tmp }}{{ shared }}"),
    ).toEqual(['shared'])
  })

  it('ignores for-loop variables', () => {
    expect(
      extractVariableReferences('{% for item in things %}{{ item }}{% endfor %}'),
    ).toEqual(['things'])
  })

  it('ignores namespace member-access roots (per-field namespace, not a variable)', () => {
    // `{{ n.c }}` referencing an undefined namespace is NOT offered as a scalar
    // variable, because dotted access cannot resolve against a string global.
    expect(extractVariableReferences('{{ n.c }}')).toEqual([])
  })

  it('does not scan literal text outside template blocks', () => {
    expect(extractVariableReferences('plain words with no braces')).toEqual([])
  })
})

describe('scanPayloadForTemplates — variablesReferenced', () => {
  it('dedupes and sorts variables referenced across multiple fields', () => {
    const yaml = `- type: rectangle
  x_start: 0
  y_start: 0
  x_end: 10
  y_end: 10
  fill: "{{ uv_fill }}"
- type: line
  x_start: 0
  x_end: 10
  y_start: 5
  y_end: 5
  fill: "{{ accent }}{{ uv_fill }}"
`
    const scan = scanPayloadForTemplates(parseYamlPayload(yaml))
    expect(scan.variablesReferenced).toEqual(['accent', 'uv_fill'])
  })
})
