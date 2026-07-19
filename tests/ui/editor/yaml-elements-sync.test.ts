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

  describe('multi-element reorders with duplicates (issue #17)', () => {
    // Two structurally identical "Same" elements at indices 0 and 2; B/C are
    // distinct fillers. `findSingleLayerMove` only detects a single
    // from->to move, so any of these reorders that change *two or more*
    // elements at once fall through to the signature-match fallback.
    const A = { type: 'text' as const, value: 'Same', x: 0, y: 0 }
    const A2 = { type: 'text' as const, value: 'Same', x: 0, y: 0 }
    const B = { type: 'text' as const, value: 'B', x: 1, y: 1 }
    const C = { type: 'text' as const, value: 'C', x: 2, y: 2 }
    const D = { type: 'text' as const, value: 'D', x: 3, y: 3 }

    it('keeps a stationary duplicate selected while unrelated elements swap', () => {
      const prev = [A, B, A2, C]
      // B and C swap; A/A2 never move. Not a single from->to move.
      const next = [A, C, A2, B]
      expect(remapSelectedIndex(prev, next, 2)).toBe(2)
    })

    it('keeps a stationary duplicate selected through a 3-way rotation elsewhere', () => {
      const prev = [A, B, A2, C, D]
      // B, C, D rotate (B->C's slot, C->D's slot, D->B's slot); A/A2 untouched.
      const next = [A, D, A2, B, C]
      expect(remapSelectedIndex(prev, next, 2)).toBe(2)
    })

    it('keeps a stationary duplicate selected when a distant pair swaps far away', () => {
      const prev = [A, B, A2, C, D]
      const next = [A, D, A2, C, B]
      expect(remapSelectedIndex(prev, next, 2)).toBe(2)
    })

    it('follows a moved duplicate to the nearest matching slot', () => {
      const prev = [A, B, A2, C, D]
      // Multi-element scramble (no single splice reproduces it): duplicates
      // land at indices 0 and 3, nothing matches at the old index 2.
      // |3 - 2| = 1 beats |0 - 2| = 2, so the nearest match wins — a
      // first-match fallback would wrongly return 0.
      const next = [A, C, D, A2, B]
      expect(remapSelectedIndex(prev, next, 2)).toBe(3)
    })

    it('breaks an equal-distance tie toward the lower index', () => {
      const A3 = { type: 'text' as const, value: 'Same', x: 0, y: 0 }
      const prev = [B, A, A2, C, A3]
      // Multi-element scramble (no single splice reproduces it): three
      // duplicates land at indices 0, 1, and 3; old index 2 matches none.
      // Distances are 2, 1, 1 — indices 1 and 3 tie, and the tie resolves
      // to the lower index 1. A first-match fallback would wrongly return
      // 0 (the farther duplicate).
      const next = [A, A2, B, A3, C]
      expect(remapSelectedIndex(prev, next, 2)).toBe(1)
    })

    it('still finds a single remaining duplicate far from the old index', () => {
      const prev = [A, B, A2, C]
      // One duplicate deleted (the length change skips the earlier
      // heuristics); the only surviving match sits at distance 2 and must
      // still be found rather than dropped for being far away.
      const next = [A, B, C]
      expect(remapSelectedIndex(prev, next, 2)).toBe(0)
    })
  })
})

describe('resolveLinkedElementIndex', () => {
  it('keeps focus on the moved element when selectedIndex lags by one render', () => {
    const movedDown = [elements[0]!, elements[2]!, elements[1]!]
    expect(resolveLinkedElementIndex(elements, movedDown, 2)).toBe(1)
  })
})
