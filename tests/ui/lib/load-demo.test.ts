import { describe, expect, it } from 'vitest'
import { shouldConfirmLoadDemo } from '../../../src/ui/lib/load-demo'

describe('shouldConfirmLoadDemo', () => {
  it('does not confirm when the canvas is empty', () => {
    expect(shouldConfirmLoadDemo(0)).toBe(false)
  })

  it('confirms when any elements would be replaced', () => {
    expect(shouldConfirmLoadDemo(1)).toBe(true)
    expect(shouldConfirmLoadDemo(3)).toBe(true)
  })
})
