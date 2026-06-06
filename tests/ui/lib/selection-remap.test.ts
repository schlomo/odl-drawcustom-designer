import { describe, expect, it } from 'vitest'
import { remapIndexAfterMove } from '../../../src/ui/lib/selection-remap'

describe('remapIndexAfterMove', () => {
  it('follows the moved element', () => {
    expect(remapIndexAfterMove(1, 1, 3)).toBe(3)
  })

  it('shifts selection when another element moves past it', () => {
    expect(remapIndexAfterMove(2, 0, 3)).toBe(1)
    expect(remapIndexAfterMove(1, 3, 0)).toBe(2)
  })

  it('leaves selection unchanged when unrelated element moves', () => {
    expect(remapIndexAfterMove(0, 2, 3)).toBe(0)
  })
})
