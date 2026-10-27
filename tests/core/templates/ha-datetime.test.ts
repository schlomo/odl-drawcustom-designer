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

  it('exposes HA datetime attributes as numbers, so template arithmetic matches HA (showcase send failure)', () => {
    // HA's now() is a Python datetime: .second is an int, and the showcase
    // progress bar divides it. A strftime('%S') string instead raises
    // "TypeError: unsupported operand type(s) for /: 'str' and 'int'" on a
    // real send (observed on live HA, designer 3.4.9).
    const now = createHaDateTime(new Date(2026, 5, 6, 23, 44, 5))
    expect(now.year).toBe(2026)
    expect(now.month).toBe(6)
    expect(now.day).toBe(6)
    expect(now.hour).toBe(23)
    expect(now.minute).toBe(44)
    expect(now.second).toBe(5)
  })
})
