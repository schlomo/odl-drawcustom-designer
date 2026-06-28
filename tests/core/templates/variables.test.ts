import { describe, expect, it } from 'vitest'
import { evaluateTemplate } from '../../../src/core/templates/evaluate'
import { applyTemplateContextToPayload } from '../../../src/core/templates/preview'
import { parseYamlPayload } from '../../../src/core/yaml'

// User-defined Simulator variables are the supported cross-field sharing
// mechanism (the designer's analog of HA script-level `variables:`). They are
// LITERAL mock values (the resolved runtime value, consistent with mock
// states/attributes) injected VERBATIM as bare globals into EVERY field's
// template evaluation, so the same value resolves in independently-rendered
// fields. Values are NOT re-rendered as templates.
describe('user-defined Simulator variables', () => {
  it('resolves a bare variable reference in a single template', () => {
    expect(
      evaluateTemplate('{{ uv_fill }}', { states: {}, variables: { uv_fill: 'green' } }).trim(),
    ).toBe('green')
  })

  it('exposes the same variable across multiple independent fields', () => {
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
  fill: "{{ uv_fill }}"
`
    const preview = applyTemplateContextToPayload(parseYamlPayload(yaml), {
      states: {},
      variables: { uv_fill: 'red' },
    })
    expect(preview[0]?.type === 'rectangle' && preview[0].fill?.trim()).toBe('red')
    expect(preview[1]?.type === 'line' && preview[1].fill?.trim()).toBe('red')
  })

  it('injects a value containing template syntax VERBATIM (not re-rendered)', () => {
    // A literal value that happens to look like a template is emitted as-is —
    // the simulator mocks the resolved runtime value; HA never re-parses output.
    expect(
      evaluateTemplate('{{ door_label }}', {
        states: { 'binary_sensor.door': 'on' },
        variables: { door_label: "{{ iif(is_state('binary_sensor.door', 'on'), 'open', 'shut') }}" },
      }).trim(),
    ).toBe("{{ iif(is_state('binary_sensor.door', 'on'), 'open', 'shut') }}")
  })

  it('emits a bare {{ foo }} value verbatim without resolving it', () => {
    expect(
      evaluateTemplate('{{ b }}', {
        states: {},
        variables: { a: 'x', b: '{{ a }}' },
      }).trim(),
    ).toBe('{{ a }}')
  })

  it('ignores invalid or reserved variable names', () => {
    expect(
      evaluateTemplate('{{ states("sensor.temp") }}', {
        states: { 'sensor.temp': '21' },
        variables: { states: 'clobbered', 'bad name': 'x' },
      }).trim(),
    ).toBe('21')
  })
})
