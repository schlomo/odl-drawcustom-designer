import { describe, expect, it } from 'vitest'
import { mapPositionAcrossYamlResync } from '../../../src/ui/editor/yamlEditorScroll'

describe('mapPositionAcrossYamlResync', () => {
  const initial = `- type: text
  value: One
  x: 0
  y: 0
- type: text
  value: Two
  x: 10
  y: 10
`

  it('keeps cursor on the same element block when an earlier block changes size', () => {
    const cursor = initial.indexOf('value: Two')
    const updated = initial.replace('x: 0', 'x: 100')

    const mapped = mapPositionAcrossYamlResync(initial, updated, cursor)
    expect(updated.slice(mapped, mapped + 'value: Two'.length)).toBe('value: Two')
  })
})
