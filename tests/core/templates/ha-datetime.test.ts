import { describe, expect, it } from 'vitest'
import { createHaDateTime, formatHaDateTime } from '../../../src/core/templates/ha-datetime'

describe('formatHaDateTime', () => {
  const date = new Date(2026, 5, 6, 23, 44, 5)

  it('formats drawcustom clock strings', () => {
    expect(formatHaDateTime(date, '%d.%m.%Y %H:%M')).toBe('06.06.2026 23:44')
    expect(formatHaDateTime(date, '%H:%M')).toBe('23:44')
  })

  it('supports seconds and escaped percent signs', () => {
    expect(formatHaDateTime(date, '%Y-%m-%d %H:%M:%S')).toBe('2026-06-06 23:44:05')
    expect(formatHaDateTime(date, '100%% complete')).toBe('100% complete')
  })
})

describe('createHaDateTime', () => {
  it('exposes strftime like HA now()', () => {
    const now = createHaDateTime(new Date(2026, 0, 2, 8, 9, 0))
    expect(now.strftime('%d.%m.%Y %H:%M')).toBe('02.01.2026 08:09')
  })
})
