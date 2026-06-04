import { describe, expect, it } from 'vitest'
import {
  createDefaultTextElement,
  describeTextElement,
  updateTextValue,
} from '../../src/core/elements/text'

describe('text element stub', () => {
  it('updates value immutably', () => {
    const original = createDefaultTextElement()
    const updated = updateTextValue(original, 'Door open')
    expect(updated.value).toBe('Door open')
    expect(original.value).toBe('Hello World!')
  })

  it('describes element for canvas summary', () => {
    const element = createDefaultTextElement()
    expect(describeTextElement(element)).toBe('"Hello World!" at (0, 0)')
  })
})
