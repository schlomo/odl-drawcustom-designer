import { describe, expect, it } from 'vitest'
import { resolveCursorSelection } from '../../../src/core/yaml/resolveCursorSelection'
import type { DrawElement } from '../../../src/core/schema/elements'

const textElement = (value: string): DrawElement =>
  ({ type: 'text', value, x: 0, y: 0 }) as unknown as DrawElement

describe('resolveCursorSelection — issue #14 doc/elements-mismatch guard', () => {
  it('selects the resolved index when the live doc and committed elements agree structurally', () => {
    const doc = `- type: text
  value: one
- type: text
  value: two
`
    const committed = [textElement('one'), textElement('two')]
    const pos = doc.indexOf('value: two')

    const result = resolveCursorSelection(doc, pos, committed, null)

    expect(result).toEqual({ index: 1, shouldFlushPending: false })
  })

  it('defers (returns a null index) instead of a wrong index when a structural edit has changed element count but nothing valid is pending yet', () => {
    // Live doc: a new third element was inserted above, mid-typing (half-typed `type:`),
    // so it fails Zod validation and pendingParsedRef stays null (per the debounce/flush model).
    const doc = `- type: rec
  x_start: 0
- type: text
  value: one
- type: text
  value: two
`
    // Committed elements are frozen at the pre-edit two-element state.
    const committed = [textElement('one'), textElement('two')]
    const pos = doc.indexOf('value: two')

    const result = resolveCursorSelection(doc, pos, committed, null)

    expect(result.index).toBeNull()
  })

  it('flushes the pending parse and trusts the resolved index when a pending valid parse already matches the live doc structure', () => {
    // Structural edit: user inserted a new first element inside the 80ms debounce window.
    // tryParseYamlElements succeeded (pendingParsedRef is set) but flushYamlElementsSync
    // has not fired yet, so committed elements are still the stale two-element array.
    const doc = `- type: text
  value: zero
- type: text
  value: one
- type: text
  value: two
`
    const committed = [textElement('one'), textElement('two')]
    const pending = [textElement('zero'), textElement('one'), textElement('two')]
    const pos = doc.indexOf('value: two')

    const result = resolveCursorSelection(doc, pos, committed, pending)

    expect(result).toEqual({ index: 2, shouldFlushPending: true })
  })

  it('does not resolve a wrong index for a position outside every element (e.g. a comment gap)', () => {
    const doc = `- type: text
  value: one
# a comment
- type: text
  value: two
`
    const committed = [textElement('one'), textElement('two')]
    const pos = doc.indexOf('# a comment')

    const result = resolveCursorSelection(doc, pos, committed, null)

    expect(result).toEqual({ index: null, shouldFlushPending: false })
  })

  it('does not flush when counts already agree, even if a stale pending parse of a different shape exists', () => {
    const doc = `- type: text
  value: one
- type: text
  value: two
`
    const committed = [textElement('one'), textElement('two')]
    // Pending reflects an even-later edit (structurally different) not yet reflected live.
    const pending = [textElement('one'), textElement('two'), textElement('three')]
    const pos = doc.indexOf('value: two')

    const result = resolveCursorSelection(doc, pos, committed, pending)

    expect(result).toEqual({ index: 1, shouldFlushPending: false })
  })

  it('keeps positional selection working on a broken live doc when the element count still matches the frozen committed array', () => {
    // Element 1 has a syntax error (unclosed flow bracket) mid-typing, so the whole-document
    // Zod parse fails and the committed array is frozen — but parseDocument still recovers
    // all three items, counts agree, and clicking element 2 must select element 2.
    const doc = `- type: text
  value: one
- type: text
  value: [unclosed
  x: 0
- type: text
  value: two
`
    const committed = [textElement('one'), textElement('broken'), textElement('two')]
    const pos = doc.indexOf('value: two')

    const result = resolveCursorSelection(doc, pos, committed, null)

    expect(result).toEqual({ index: 2, shouldFlushPending: false })
  })

  it('defers on a broken live doc whose recovered element count disagrees with the committed array', () => {
    // A new (broken) element was inserted above inside the debounce window: live doc
    // recovers 3 items but committed is frozen at 2 and nothing valid is pending.
    const doc = `- type: text
  value: [unclosed
- type: text
  value: one
- type: text
  value: two
`
    const committed = [textElement('one'), textElement('two')]
    const pos = doc.indexOf('value: two')

    const result = resolveCursorSelection(doc, pos, committed, null)

    expect(result).toEqual({ index: null, shouldFlushPending: false })
  })
})
