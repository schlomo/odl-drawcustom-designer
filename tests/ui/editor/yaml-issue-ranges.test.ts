import { describe, expect, it } from 'vitest'
import { APP_TITLE } from '../../../src/core'
import { parseYamlPayload, validatePayload } from '../../../src/core'
import {
  findFieldRange,
  findListItemSpans,
  locateParseErrorInYaml,
  locateZodIssueInYaml,
  locateZodPathInYaml,
} from '../../../src/ui/editor/yamlIssueRanges'

describe('findListItemSpans', () => {
  it('finds each top-level list item', () => {
    const doc = `- type: text
  value: one
- type: line
  x_start: 0
`
    const spans = findListItemSpans(doc)
    expect(spans).toHaveLength(2)
    expect(spans[0]?.index).toBe(0)
    expect(spans[1]?.index).toBe(1)
    expect(spans[0]?.end).toBe(spans[1]?.start)
  })

  it('ignores nested list items inside polygon points', () => {
    const doc = `- type: text
  value: one
- type: polygon
  points:
    - - 10
      - 10
    - - 50
      - 10
    - - 30
      - 40
`
    const spans = findListItemSpans(doc)
    expect(spans).toHaveLength(2)
    expect(spans[1]?.index).toBe(1)
    expect(doc.slice(spans[1]!.start, spans[1]!.end)).toContain('type: polygon')
    expect(doc.slice(spans[1]!.start, spans[1]!.end)).toContain('- - 10')
  })
})

describe('findFieldRange', () => {
  it('returns the value span for a field', () => {
    const doc = `- type: text d
  value: Hello
`
    const itemEnd = doc.length
    const range = findFieldRange(doc, 0, itemEnd, 'type')
    expect(range).not.toBeNull()
    expect(doc.slice(range!.from, range!.to)).toBe('text d')
  })
})

describe('locateZodPathInYaml', () => {
  it('locates invalid type on the first element only', () => {
    const doc = `- type: text d
  value: ${APP_TITLE}
  x: 10
- type: rectangle
  x_start: 10
`
    const range = locateZodPathInYaml(doc, [0, 'type'])
    expect(range).not.toBeNull()
    expect(doc.slice(range!.from, range!.to)).toBe('text d')

    const firstLineEnd = doc.indexOf('\n')
    expect(range!.to).toBeLessThanOrEqual(firstLineEnd)
  })

  it('can locate either the key or the value span for a field', () => {
    const doc = `- type: text
  value: Hello
  not_a_field: true
  x: 0
`
    const itemEnd = findListItemSpans(doc)[0]?.end ?? doc.length
    const valueRange = findFieldRange(doc, 0, itemEnd, 'not_a_field')
    expect(valueRange).not.toBeNull()
    expect(doc.slice(valueRange!.from, valueRange!.to)).toBe('true')

    const keyRange = findFieldRange(doc, 0, itemEnd, 'not_a_field', 'key')
    expect(keyRange).not.toBeNull()
    expect(doc.slice(keyRange!.from, keyRange!.to)).toBe('not_a_field')
  })
})

describe('locateZodIssueInYaml', () => {
  it('highlights unrecognized keys on the first list item', () => {
    const doc = `- type: rectangle
  x_tart: 10
  x_end: 180
- type: text
  value: Hi
`
    const parsed = parseYamlPayload(doc)
    const result = validatePayload(parsed)
    expect(result.success).toBe(false)
    if (result.success) {
      return
    }

    const unrecognized = result.error.issues.find((issue) =>
      issue.message.includes('Unrecognized key'),
    )
    expect(unrecognized).toBeDefined()

    const range = locateZodIssueInYaml(doc, unrecognized!)
    expect(doc.slice(range.from, range.to)).toBe('x_tart')
    expect(range.from).toBeGreaterThan(0)
  })

  it('highlights unrecognized keys by name in the editor', () => {
    const doc = `- type: text
  value: ${APP_TITLE} {{ "foo" }}
  ont: ppb.ttf
  x: 10
`
    const parsed = parseYamlPayload(doc)
    const result = validatePayload(parsed)
    expect(result.success).toBe(false)
    if (result.success) {
      return
    }

    const unrecognized = result.error.issues.find((issue) =>
      issue.message.includes('Unrecognized key: "ont"'),
    )
    expect(unrecognized).toBeDefined()

    const range = locateZodIssueInYaml(doc, unrecognized!)
    expect(doc.slice(range.from, range.to)).toBe('ont')
  })

  it('highlights the closest key when a required field is missing on the first item', () => {
    const doc = `- type: rectangle
  x_tart: 10
  x_end: 180
`
    const parsed = parseYamlPayload(doc)
    const result = validatePayload(parsed)
    expect(result.success).toBe(false)
    if (result.success) {
      return
    }

    const missing = result.error.issues.find(
      (issue) => issue.path.length === 2 && issue.path[1] === 'x_start',
    )
    expect(missing).toBeDefined()

    const range = locateZodIssueInYaml(doc, missing!)
    expect(doc.slice(range.from, range.to)).toBe('x_tart')
  })
})

describe('locateParseErrorInYaml', () => {
  it('maps parse errors to a single line when possible', () => {
    const doc = `- type: text
  value: [unclosed
  x: 0
`
    const range = locateParseErrorInYaml(
      doc,
      'Flow sequence in block collection must be sufficiently indented and end with a ] at line 3, column 3',
    )
    expect(doc.slice(range.from, range.to)).toBe('  x: 0')
  })
})
