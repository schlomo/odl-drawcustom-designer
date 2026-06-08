import { describe, expect, it } from 'vitest'
import { linkedElementDecorationsForTest } from '../../../src/ui/editor/yamlLinkedElement'

describe('yaml linked element highlight', () => {
  it('marks every line in the selected element block', () => {
    const doc = `- type: text
  value: One
- type: icon
  value: home
  x: 10
  y: 20
- type: line
  x_start: 0
  x_end: 10
`

    const decorations = linkedElementDecorationsForTest(doc, 1)
    expect(decorations.size).toBe(4)
  })

  it('highlights block-form polygon points without treating them as separate elements', () => {
    const doc = `- type: text
  value: One
- type: polygon
  points:
    - - 10
      - 10
    - - 50
      - 10
    - - 30
      - 40
`

    const decorations = linkedElementDecorationsForTest(doc, 1)
    expect(decorations.size).toBe(8)
  })

  it('returns no decorations when nothing is linked', () => {
    const doc = `- type: text
  value: One
`
    expect(linkedElementDecorationsForTest(doc, null).size).toBe(0)
  })
})
