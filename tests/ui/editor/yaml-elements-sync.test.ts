import { describe, expect, it } from 'vitest'
import { serializeYamlPayload, type DrawElement } from '../../../src/core'
import { SHOWCASE_ELEMENTS } from '../../../src/ui/data/showcase'
import {
  elementsSequenceEqual,
  getYamlElementsParseIssues,
  isYamlDocBlocked,
  remapSelectedIndex,
  resolveLinkedElementIndex,
  stableElementSignature,
  summarizeYamlElementsParseIssues,
  tryParseYamlElements,
} from '../../../src/ui/editor/yamlElementsSync'

const elements: DrawElement[] = [
  { type: 'text', value: 'A', x: 0, y: 0 },
  { type: 'text', value: 'B', x: 1, y: 1 },
  { type: 'text', value: 'C', x: 2, y: 2 },
]

describe('getYamlElementsParseIssues', () => {
  it('summarizes schema validation failures', () => {
    const source = `- type: icon
  value: mdi:home
  x: 0
  y: 0
  size: "{{ states('sensor.size') }}"
`
    expect(getYamlElementsParseIssues(source)).toEqual([])
    expect(summarizeYamlElementsParseIssues(getYamlElementsParseIssues(source))).toBeNull()
  })

  it('reports invalid fields for the status banner', () => {
    const source = `- type: icon
  value: mdi:home
  x: 0
  y: 0
  size: not-a-number
`
    const issues = getYamlElementsParseIssues(source)
    expect(issues.length).toBeGreaterThan(0)
    expect(summarizeYamlElementsParseIssues(issues)).toContain('0.size')
  })
})

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

describe('isYamlDocBlocked', () => {
  it('is false for valid yaml', () => {
    expect(isYamlDocBlocked(serializeYamlPayload(elements))).toBe(false)
  })

  it('is false for blank yaml', () => {
    expect(isYamlDocBlocked('   \n')).toBe(false)
  })

  it('is true for a schema validation failure (unrecognized key)', () => {
    expect(isYamlDocBlocked('- type: text\n  value: hi\n  nope: 1')).toBe(true)
  })

  it('is true for a YAML syntax error', () => {
    expect(isYamlDocBlocked('- type: text\n  value: [unclosed')).toBe(true)
  })

  it('is true when a required colon is deleted, breaking the mapping', () => {
    // Same shape as the Playwright repro: deleting the first `:` turns
    // `type: rectangle` into an invalid mapping key.
    expect(isYamlDocBlocked('- type rectangle\n  x_start: 0\n  x_end: 10')).toBe(true)
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

  it('matches showcase round-trip without yaml canonicalization', () => {
    const parsed = tryParseYamlElements(serializeYamlPayload(SHOWCASE_ELEMENTS))!
    expect(elementsSequenceEqual(SHOWCASE_ELEMENTS, parsed)).toBe(true)
  })

  it('treats key order differences as equal', () => {
    const left = { type: 'text' as const, value: 'Hi', x: 0, y: 0, font: 'ppb.ttf', size: 20 }
    const right = { type: 'text' as const, value: 'Hi', x: 0, y: 0, size: 20, font: 'ppb.ttf' }
    expect(stableElementSignature(left)).toBe(stableElementSignature(right))
    expect(elementsSequenceEqual([left], [right])).toBe(true)
  })
})

describe('remapSelectedIndex', () => {
  it('follows the same element after a reorder', () => {
    const reordered = [elements[2]!, elements[0]!, elements[1]!]
    expect(remapSelectedIndex(elements, reordered, 2)).toBe(0)
  })

  it('follows layer down (one step toward back) while selection index is stale', () => {
    const movedDown = [elements[0]!, elements[2]!, elements[1]!]
    expect(remapSelectedIndex(elements, movedDown, 2)).toBe(1)
  })

  it('remaps selection for duplicate elements after a single layer move', () => {
    const twins: DrawElement[] = [
      { type: 'text', value: 'Same', x: 0, y: 0 },
      { type: 'text', value: 'Same', x: 10, y: 10 },
    ]
    const moved = [twins[1]!, twins[0]!]
    expect(remapSelectedIndex(twins, moved, 1)).toBe(0)
  })

  it('keeps index after a property edit at the same position', () => {
    const edited = [...elements]
    edited[1] = { ...edited[1]!, value: 'B updated' }
    expect(remapSelectedIndex(elements, edited, 1)).toBe(1)
  })

  it('keeps index when only the selected element color changes', () => {
    const edited = [...elements]
    edited[0] = {
      ...edited[0]!,
      color: 'r',
    }
    expect(remapSelectedIndex(elements, edited, 0)).toBe(0)
  })

  it('returns null when the selected element was removed', () => {
    const removed = [elements[0]!, elements[1]!]
    expect(remapSelectedIndex(elements, removed, 2)).toBeNull()
  })
})

describe('resolveLinkedElementIndex', () => {
  it('keeps focus on the moved element when selectedIndex lags by one render', () => {
    const movedDown = [elements[0]!, elements[2]!, elements[1]!]
    expect(resolveLinkedElementIndex(elements, movedDown, 2)).toBe(1)
  })
})
