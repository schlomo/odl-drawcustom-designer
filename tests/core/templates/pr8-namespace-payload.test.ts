import { describe, expect, it } from 'vitest'
import { evaluateTemplate } from '../../../src/core/templates/evaluate'
import { applyTemplateContextToPayload } from '../../../src/core/templates/preview'
import { parseYamlPayload } from '../../../src/core/yaml'

// Maintainer-reported automation shape (structured `payload:` list, each field
// its own template). A rectangle's `fill` defines a namespace; a later line's
// `fill` references it. Real Home Assistant renders each field string as its own
// `Template` (config_validation.template_complex → service.render_complex), so
// `{% set %}` / namespace() side effects do NOT cross fields: the line's
// `{{ n.c }}` comes back empty ("n is undefined"). The designer must match.
const PR8_NAMESPACE_YAML = `- type: rectangle
  x_start: 10
  y_start: 10
  x_end: 100
  y_end: 60
  fill: >-
    {%- set n = namespace(c='black') -%}
    {{ n.c }}
- type: line
  x_start: 11
  x_end: 371
  y_start: 145
  y_end: 145
  fill: "{{ n.c }}"
`

describe('PR #8 namespace payload — per-field evaluation (HA parity)', () => {
  it('resolves a namespace defined and used within a single field', () => {
    const withinField = "{%- set n = namespace(c='black') -%}{{ n.c }}"
    expect(evaluateTemplate(withinField, { states: {} }).trim()).toBe('black')
  })

  it('rectangle fill resolves its own namespace (within-field)', () => {
    const payload = parseYamlPayload(PR8_NAMESPACE_YAML)
    const preview = applyTemplateContextToPayload(payload, { states: {} })
    expect(preview[0]?.type).toBe('rectangle')
    if (preview[0]?.type === 'rectangle') {
      expect(preview[0].fill?.trim()).toBe('black')
    }
  })

  it('line fill does NOT see the namespace defined in the rectangle (no carry-over)', () => {
    const payload = parseYamlPayload(PR8_NAMESPACE_YAML)
    const preview = applyTemplateContextToPayload(payload, { states: {} })
    expect(preview[1]?.type).toBe('line')
    if (preview[1]?.type === 'line') {
      // `n` is undefined in this independently-rendered field → empty string.
      expect(preview[1].fill?.trim()).toBe('')
    }
  })

  it('order does not matter — each field is independent', () => {
    const reversed = `- type: line
  x_start: 11
  x_end: 371
  y_start: 145
  y_end: 145
  fill: "{{ n.c }}"
- type: rectangle
  x_start: 10
  y_start: 10
  x_end: 100
  y_end: 60
  fill: >-
    {%- set n = namespace(c='black') -%}
    {{ n.c }}
`
    const preview = applyTemplateContextToPayload(parseYamlPayload(reversed), { states: {} })
    expect(preview[0]?.type).toBe('line')
    if (preview[0]?.type === 'line') {
      expect(preview[0].fill?.trim()).toBe('')
    }
    expect(preview[1]?.type).toBe('rectangle')
    if (preview[1]?.type === 'rectangle') {
      expect(preview[1].fill?.trim()).toBe('black')
    }
  })
})
