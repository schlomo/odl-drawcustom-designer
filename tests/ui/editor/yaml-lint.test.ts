import { describe, expect, it } from 'vitest'
import { lintYamlDocument } from '../../../src/ui/editor/yamlLint'

describe('lintYamlDocument', () => {
  it('returns no diagnostics for valid payload', () => {
    const source = `- type: text
  value: Hello
  x: 0
  y: 0
`
    expect(lintYamlDocument(source)).toEqual([])
  })

  it('reports parse errors', () => {
    const source = `- type: text
  value: [unclosed
`
    const diagnostics = lintYamlDocument(source)
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics[0]?.severity).toBe('error')
    expect(diagnostics[0]?.message.length).toBeGreaterThan(0)
  })

  it('reports schema validation errors', () => {
    const source = `- type: text
  value: Hello
  x: 0
  y: 0
  not_a_field: true
`
    const diagnostics = lintYamlDocument(source)
    expect(diagnostics.some((d) => d.message.includes('not_a_field'))).toBe(true)
    expect(diagnostics.every((d) => d.severity === 'error')).toBe(true)
  })

  it('highlights only the invalid field, not the whole document', () => {
    const source = `- type: text d
  value: OEPL Designer
  x: 10
  y: 10
- type: rectangle
  x_start: 10
  x_end: 180
`
    const diagnostics = lintYamlDocument(source)
    const typeDiagnostic = diagnostics.find((d) => d.message.includes('type'))
    expect(typeDiagnostic).toBeDefined()
    expect(typeDiagnostic!.to - typeDiagnostic!.from).toBeLessThan(source.length)
    expect(source.slice(typeDiagnostic!.from, typeDiagnostic!.to)).toBe('text d')

    const rectangleStart = source.indexOf('- type: rectangle')
    expect(typeDiagnostic!.to).toBeLessThan(rectangleStart)
  })

  it('highlights only the invalid field on the first list item', () => {
    const source = `- type: rectangle
  x_tart: 10
  x_end: 180
  y_start: 50
  y_end: 120
  width: 2
  fill: white
  outline: black
- type: text
  value: Hi
`
    const diagnostics = lintYamlDocument(source)
    const unrecognized = diagnostics.find((d) => d.message.includes('x_tart'))
    expect(unrecognized).toBeDefined()
    expect(source.slice(unrecognized!.from, unrecognized!.to)).toBe('x_tart')

    const missing = diagnostics.find((d) => d.message.includes('x_start'))
    expect(missing).toBeDefined()
    expect(source.slice(missing!.from, missing!.to)).toBe('x_tart')
  })

  it('accepts template strings in values', () => {
    const source = `- type: text
  value: "{{ states('sensor.temperature') }}°C"
  x: 10
  y: 10
`
    expect(lintYamlDocument(source)).toEqual([])
  })
})
