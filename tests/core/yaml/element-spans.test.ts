import { describe, expect, it } from 'vitest'
import {
  elementIndexAtOffset,
  findElementSpans,
} from '../../../src/core/yaml/elementSpans'

describe('findElementSpans (AST-backed mapping)', () => {
  it('maps block-style top-level elements with no gaps', () => {
    const doc = `- type: text
  value: one
- type: line
  x_start: 0
`
    const spans = findElementSpans(doc)
    expect(spans).toHaveLength(2)
    expect(spans[0]?.index).toBe(0)
    expect(spans[1]?.index).toBe(1)
    expect(spans[0]?.end).toBe(spans[1]?.start)
  })

  it('maps a flow-style top-level array — issue #15 repro', () => {
    const doc = '[{type: text, value: hi, x: 0, y: 0}, {type: circle, x: 10, y: 10, radius: 5}]'
    const spans = findElementSpans(doc)
    expect(spans).toHaveLength(2)

    // Forward direction: index -> offset range resolves back to the right substring.
    expect(doc.slice(spans[0]!.start, spans[0]!.end)).toContain('type: text')
    expect(doc.slice(spans[1]!.start, spans[1]!.end)).toContain('type: circle')

    // Reverse direction: offset inside each flow item -> element index.
    const firstPos = doc.indexOf('value: hi')
    const secondPos = doc.indexOf('radius: 5')
    expect(elementIndexAtOffset(doc, firstPos)).toBe(0)
    expect(elementIndexAtOffset(doc, secondPos)).toBe(1)
  })

  it('does not attribute a comment between elements to the preceding element', () => {
    const doc = `- type: text
  value: hi
# a comment describing the next element
- type: circle
  radius: 5
`
    const commentPos = doc.indexOf('# a comment')
    expect(elementIndexAtOffset(doc, commentPos)).toBeNull()

    const spans = findElementSpans(doc)
    expect(spans).toHaveLength(2)
    expect(doc.slice(spans[0]!.start, spans[0]!.end)).not.toContain('a comment')
  })

  it('does not attribute a blank line between elements to the preceding element', () => {
    const doc = `- type: text
  value: hi

- type: circle
  radius: 5
`
    const blankLinePos = doc.indexOf('\n\n') + 1
    expect(elementIndexAtOffset(doc, blankLinePos)).toBeNull()
  })

  it('maps multi-line Jinja template block-scalar strings within an element to that element', () => {
    const doc = `- type: text
  value: |
    line one
    {{ states('sensor.x') }}
    line three
  x: 0
- type: circle
  radius: 5
`
    const templateLinePos = doc.indexOf("states('sensor.x')")
    expect(elementIndexAtOffset(doc, templateLinePos)).toBe(0)

    const spans = findElementSpans(doc)
    expect(doc.slice(spans[0]!.start, spans[0]!.end)).toContain("states('sensor.x')")
  })

  it('distinguishes duplicate elements by position, not identity', () => {
    const doc = `- type: circle
  radius: 5
- type: circle
  radius: 5
- type: circle
  radius: 5
`
    const spans = findElementSpans(doc)
    expect(spans).toHaveLength(3)
    expect(spans[0]?.start).toBeLessThan(spans[1]!.start)
    expect(spans[1]?.start).toBeLessThan(spans[2]!.start)

    const secondPos = spans[1]!.start + 'type: circle'.length
    expect(elementIndexAtOffset(doc, secondPos)).toBe(1)
  })
})

describe('elementIndexAtOffset', () => {
  it('returns null for an empty or non-list document', () => {
    expect(elementIndexAtOffset('\n\n', 1)).toBeNull()
  })

  it('returns null for a flow-style document before the fix would have silently no-opped', () => {
    // Historically findListItemSpans (regex `/^-\s/`) returned zero spans for flow style,
    // so every index resolved to null. The AST mapping must resolve real indices instead.
    const doc = '[{type: text, value: hi}, {type: circle, radius: 5}]'
    const pos = doc.indexOf('circle')
    expect(elementIndexAtOffset(doc, pos)).not.toBeNull()
    expect(elementIndexAtOffset(doc, pos)).toBe(1)
  })
})
