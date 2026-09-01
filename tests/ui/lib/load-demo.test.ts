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

  // While the document is broken `elements` is frozen at last-valid, so an
  // empty count does not mean an empty editor — the user may be part-way
  // through hand-typing a whole design. Load Demo can now run in that state
  // (it is an escape hatch out of it), so it must still ask first.
  it('confirms on a broken document even with no committed elements', () => {
    expect(shouldConfirmLoadDemo(0, true)).toBe(true)
  })

  it('still skips the prompt on an empty, valid document', () => {
    expect(shouldConfirmLoadDemo(0, false)).toBe(false)
  })
})
