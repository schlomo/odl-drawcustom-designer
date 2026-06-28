import { describe, expect, it } from 'vitest'
import { findTemplatePreviewAnchors } from '../../../src/ui/editor/templatePreviewAnchors'

// Maintainer-reported payload from PR #8 (GitHub comment), corrected to match
// real Home Assistant: each templated field is rendered independently, so a
// namespace defined in one element's field is NOT visible to another element's
// field. The inline preview must match the canvas render path.
const PR8_NAMESPACE_DOC = `- type: rectangle
  x_start: 10
  y_start: 10
  x_end: 100
  y_end: 60
  fill: >-
    {%- set n = namespace(c='black') -%}
    {{ n.c }}
- type: line
  x_start: 11
  x_end: 371
  y_start: 145
  y_end: 145
  fill: "{{ n.c }}"
`

describe('template preview — namespace in block scalar (PR #8, per-field)', () => {
  it('previews the defining field via its own namespace, and the referencing field empty', () => {
    const anchors = findTemplatePreviewAnchors(PR8_NAMESPACE_DOC, { states: {} })
    // Two anchors: the rectangle block scalar (defines + uses n → 'black') and
    // the line quoted fill (references n, which is undefined here → empty).
    expect(anchors).toHaveLength(2)
    expect(anchors[0]?.preview).toBe('black')
    expect(anchors[1]?.preview).toBe('')
  })

  it('keeps each field independent regardless of order', () => {
    const reversed = `- type: line
  x_start: 11
  fill: "{{ n.c }}"
- type: rectangle
  fill: >-
    {%- set n = namespace(c='black') -%}
    {{ n.c }}
`
    const anchors = findTemplatePreviewAnchors(reversed, { states: {} })
    expect(anchors).toHaveLength(2)
    // First (line) anchor references undefined n → empty; second (rectangle) → black.
    expect(anchors[0]?.preview).toBe('')
    expect(anchors[1]?.preview).toBe('black')
  })
})
