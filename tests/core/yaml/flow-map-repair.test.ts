import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseYamlPayload } from '../../../src/core/yaml/parse'
import {
  quoteUnquotedBraceScalars,
  repairFlowMapMisparse,
} from '../../../src/core/yaml/flow-map-repair'

describe('quoteUnquotedBraceScalars', () => {
  it('quotes unquoted brace scalars that would parse as flow maps', () => {
    const source = `- type: rectangle
  x_start: 0
  y_start: 0
  x_end: {{ }}
  y_end: 10
`
    expect(quoteUnquotedBraceScalars(source)).toContain('x_end: "{{ }}"')
  })

  it('quotes brace scalars on JSON-style quoted property keys', () => {
    const line = '  "size": {{ }}'
    expect(quoteUnquotedBraceScalars(line)).toBe('  "size": "{{ }}"')
  })

  it('leaves flow maps with nested values unchanged', () => {
    const line = '  meta: { key: value }'
    expect(quoteUnquotedBraceScalars(line)).toBe(line)
  })
})

describe('repairFlowMapMisparse', () => {
  it('reconstructs jinja from single-key flow map misparses', () => {
    expect(repairFlowMapMisparse({ '{}': null })).toBe('{{}}')
    expect(repairFlowMapMisparse({ "{ states('x') }": null })).toBe("{{ states('x') }}")
    expect(repairFlowMapMisparse({ true: null })).toBe('{ true }')
  })
})

describe('parseYamlPayload brace scalars', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('preserves unquoted jinja coordinate templates as strings', () => {
    const source = `- type: rectangle
  x_start: 0
  y_start: 0
  x_end: {{ }}
  y_end: 10
`
    const [element] = parseYamlPayload(source)
    expect(element).toMatchObject({
      type: 'rectangle',
      x_end: '{{ }}',
      y_end: 10,
    })
  })

  it('does not warn when parsing incomplete brace scalars', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseYamlPayload(`- type: text
  value: hi
  visible: { true }
`)
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not warn for JSON-style keys with unquoted jinja stubs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseYamlPayload(`- "type": "text"
  "value": "Hi"
  "size": {{ }}
`)
    expect(warn).not.toHaveBeenCalled()
    const [element] = parseYamlPayload(`- "type": "text"
  "value": "Hi"
  "size": {{ }}
`)
    expect(element).toMatchObject({ type: 'text', size: '{{ }}' })
  })
})
