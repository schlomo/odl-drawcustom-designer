import { describe, expect, it } from 'vitest'
import { serializeYamlPayload, type DrawElement } from '../../../src/core'
import {
  elementsSequenceEqual,
  remapSelectedIndex,
  tryParseYamlElements,
} from '../../../src/ui/editor/yamlElementsSync'

const elements: DrawElement[] = [
  { type: 'text', value: 'A', x: 0, y: 0 },
  { type: 'text', value: 'B', x: 1, y: 1 },
  { type: 'text', value: 'C', x: 2, y: 2 },
]

describe('tryParseYamlElements', () => {
  it('returns validated elements for valid yaml', () => {
    const yaml = serializeYamlPayload(elements)
    expect(tryParseYamlElements(yaml)).toEqual(elements)
  })

  it('returns null for invalid yaml', () => {
    expect(tryParseYamlElements('- type: text\n  value: hi\n  nope: 1')).toBeNull()
  })

  it('returns null for parse errors', () => {
    expect(tryParseYamlElements('- type: text\n  value: [unclosed')).toBeNull()
  })

  it('returns an empty list for blank yaml', () => {
    expect(tryParseYamlElements('   \n')).toEqual([])
  })
})

describe('elementsSequenceEqual', () => {
  it('detects reordering as a change', () => {
    const reordered = [elements[2]!, elements[0]!, elements[1]!]
    expect(elementsSequenceEqual(elements, reordered)).toBe(false)
  })

  it('returns true for identical sequences', () => {
    expect(elementsSequenceEqual(elements, [...elements])).toBe(true)
  })
})

describe('remapSelectedIndex', () => {
  it('follows the same element after a reorder', () => {
    const reordered = [elements[2]!, elements[0]!, elements[1]!]
    expect(remapSelectedIndex(elements, reordered, 2)).toBe(0)
  })

  it('returns null when the selected element was removed', () => {
    const removed = [elements[0]!, elements[1]!]
    expect(remapSelectedIndex(elements, removed, 2)).toBeNull()
  })
})
