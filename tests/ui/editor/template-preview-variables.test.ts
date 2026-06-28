import { describe, expect, it } from 'vitest'
import { findTemplatePreviewAnchors } from '../../../src/ui/editor/templatePreviewAnchors'

// Maintainer-reported payload from PR #8 (2026-06-28): canvas render used full
// mock context (including Simulator variables) but inline preview omitted them.
const PR8_VARIABLES_DOC = `- type: icon
  icon: mdi:thermometer
  x: 10
  y: 10
  fill: |-
    {{ something2 }}
- type: line
  x_start: 0
  y_start: 50
  x_end: 100
  y_end: 50
  fill: |-
    {{ 'green' if something3 == false else 'red' }}
`

describe('template preview — Simulator variables (PR #8 parity)', () => {
  const context = {
    states: {},
    variables: { something2: 'blue', something3: 'false' },
  }

  it('resolves variable references in block scalar templates', () => {
    const anchors = findTemplatePreviewAnchors(PR8_VARIABLES_DOC, context)
    expect(anchors).toHaveLength(2)
    expect(anchors[0]?.preview).toBe('blue')
    expect(anchors[1]?.preview).toBe('green')
  })

  it('resolves variable references in quoted-string templates', () => {
    const doc = `- type: icon
  fill: "{{ something2 }}"
- type: line
  fill: "{{ 'green' if something3 == false else 'red' }}"
`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toHaveLength(2)
    expect(anchors[0]?.preview).toBe('blue')
    expect(anchors[1]?.preview).toBe('green')
  })

  it('shows empty preview when variables are omitted from context', () => {
    const anchors = findTemplatePreviewAnchors(PR8_VARIABLES_DOC, { states: {} })
    expect(anchors).toHaveLength(2)
    expect(anchors[0]?.preview).toBe('')
    expect(anchors[1]?.preview).toBe('red')
  })
})
