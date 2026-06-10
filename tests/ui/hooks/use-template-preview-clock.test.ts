import { describe, expect, it } from 'vitest'
import { msUntilNextMinute, msUntilNextSecond } from '../../../src/ui/hooks/useTemplatePreviewClock'

describe('msUntilNextSecond', () => {
  it('aligns to the next whole second', () => {
    expect(msUntilNextSecond(new Date(2026, 0, 1, 12, 0, 5, 250))).toBe(750)
    expect(msUntilNextSecond(new Date(2026, 0, 1, 12, 0, 5, 999))).toBe(1)
    expect(msUntilNextSecond(new Date(2026, 0, 1, 12, 0, 5, 0))).toBe(1000)
  })
})

describe('msUntilNextMinute', () => {
  it('aligns to the next whole minute', () => {
    expect(msUntilNextMinute(new Date(2026, 0, 1, 12, 0, 5, 250))).toBe(54750)
    expect(msUntilNextMinute(new Date(2026, 0, 1, 12, 0, 59, 999))).toBe(1)
  })
})
