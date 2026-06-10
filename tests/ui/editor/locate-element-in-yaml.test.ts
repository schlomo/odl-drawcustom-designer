import { describe, expect, it } from 'vitest'
import {
  getListItemBlockAtPosition,
  locateElementFocusInYaml,
  locateElementIndexAtPosition,
  locateElementStartInYaml,
} from '../../../src/ui/editor/locateElementInYaml'

const sampleDoc = `- type: text
  value: one
  x: 0
- type: rectangle
  x_start: 10
  y_start: 50
`

describe('locateElementStartInYaml', () => {
  it('returns the document offset for a list item index', () => {
    const second = locateElementStartInYaml(sampleDoc, 1)
    expect(second).not.toBeNull()
    expect(sampleDoc.slice(second!, second! + 14)).toBe('- type: rectan')
  })

  it('returns null for out-of-range indices', () => {
    const doc = `- type: text
`
    expect(locateElementStartInYaml(doc, 1)).toBeNull()
    expect(locateElementStartInYaml(doc, -1)).toBeNull()
  })
})

describe('locateElementIndexAtPosition', () => {
  it('returns the element index for a cursor inside that block', () => {
    const rectangleLine = sampleDoc.indexOf('x_start')
    expect(locateElementIndexAtPosition(sampleDoc, rectangleLine)).toBe(1)
  })

  it('returns the first element when the cursor is on its header', () => {
    const textLine = sampleDoc.indexOf('value: one')
    expect(locateElementIndexAtPosition(sampleDoc, textLine)).toBe(0)
  })

  it('returns null before the first list item', () => {
    expect(locateElementIndexAtPosition('\n\n', 1)).toBeNull()
  })

  it('maps cursor positions inside block-form polygon points to the polygon element', () => {
    const doc = `- type: text
  value: one
- type: polygon
  points:
    - - 10
      - 10
    - - 50
      - 10
`
    const pointPos = doc.indexOf('- - 50')
    expect(locateElementIndexAtPosition(doc, pointPos)).toBe(1)
  })

  it('keeps the rectangle when the cursor is on the last property line before the next element', () => {
    const doc = `- type: rectangle
  x_start: 30
  x_end: 180
  y_start: 140
  y_end: 212
  fill: white
  outline: black
  width: 30
- type: circle
  x: 224
  y: 174
`
    const cursorAfterWidth = doc.indexOf('width: 30') + 'width: 30'.length
    expect(locateElementIndexAtPosition(doc, cursorAfterWidth)).toBe(0)
  })

  it('mis-identifies the next element when position is paired with a stale shorter document', () => {
    const current = `- type: rectangle
  x_start: 30
  outline: black
  width: 30
- type: circle
  x: 224
`
    const stale = current.replace('width: 30', 'width: 3')
    const cursorAfterWidth = current.indexOf('width: 30') + 'width: 30'.length
    expect(locateElementIndexAtPosition(current, cursorAfterWidth)).toBe(0)
    expect(locateElementIndexAtPosition(stale, cursorAfterWidth)).toBe(1)
  })
})

describe('locateElementFocusInYaml', () => {
  it('places the cursor after type: on the first list item instead of offset 0', () => {
    const doc = `- type: rectangle
  x_start: 10
- type: text
  value: Hi
`
    const focus = locateElementFocusInYaml(doc, 0)
    expect(focus).not.toBe(0)
    expect(doc.slice(focus! - 'rectangle'.length, focus!)).toBe('rectangle')
  })

  it('places the cursor after type: when the type value is still empty', () => {
    const doc = `- type:
  value: Hi
`
    const focus = locateElementFocusInYaml(doc, 0)
    expect(focus).toBe(doc.indexOf('\n'))
  })
})

describe('getListItemBlockAtPosition', () => {
  it('returns the full yaml block containing the cursor', () => {
    const pos = sampleDoc.indexOf('y_start')
    expect(getListItemBlockAtPosition(sampleDoc, pos)).toBe(`- type: rectangle
  x_start: 10
  y_start: 50
`)
  })
})
