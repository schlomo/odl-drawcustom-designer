import { describe, expect, it } from 'vitest'
import { registerFont, unregisterFont } from '../../../src/core'
import { loadBundledTestFont } from '../../core/renderer/font-test-utils'
import {
  fontLayoutTokenForKeys,
  isFontReadyForLayout,
} from '../../../src/ui/lib/font-layout-token'

describe('fontLayoutTokenForKeys', () => {
  it('changes when a font becomes ready for layout', () => {
    const key = 'TokenTest.ttf'
    unregisterFont(key)
    const empty = new Map<string, unknown>()

    const before = fontLayoutTokenForKeys([key], empty)
    expect(before).toBe(`${key}:0`)

    registerFont(key, loadBundledTestFont('ppb.ttf'))
    const after = fontLayoutTokenForKeys([key], empty)
    expect(after).toBe(`${key}:1`)
    expect(isFontReadyForLayout(key, empty)).toBe(true)

    unregisterFont(key)
  })

  it('tracks loaded map entries', () => {
    const key = 'Mapped.ttf'
    unregisterFont(key)
    const loaded = new Map<string, unknown>([[key, {}]])

    expect(fontLayoutTokenForKeys([key], loaded)).toBe(`${key}:1`)
    expect(isFontReadyForLayout(key, new Map())).toBe(false)
  })
})
