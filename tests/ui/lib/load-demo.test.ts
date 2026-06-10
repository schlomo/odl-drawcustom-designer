import { describe, expect, it } from 'vitest'
import { shouldConfirmLoadDemo } from '../../../src/ui/lib/load-demo'

describe('shouldConfirmLoadDemo', () => {
  it('does not confirm when the canvas is empty', () => {
    expect(
      shouldConfirmLoadDemo({ elementCount: 0, canUndo: true, canRedo: false }),
    ).toBe(false)
  })

  it('does not confirm when elements exist but nothing changed this session', () => {
    expect(
      shouldConfirmLoadDemo({ elementCount: 3, canUndo: false, canRedo: false }),
    ).toBe(false)
  })

  it('confirms when elements exist and the user has edited', () => {
    expect(
      shouldConfirmLoadDemo({ elementCount: 2, canUndo: true, canRedo: false }),
    ).toBe(true)
    expect(
      shouldConfirmLoadDemo({ elementCount: 1, canUndo: false, canRedo: true }),
    ).toBe(true)
  })
})
