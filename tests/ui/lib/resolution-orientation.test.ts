import { describe, expect, it } from 'vitest'
import {
  resolutionOrientation,
  resolutionOrientationHint,
} from '../../../src/ui/lib/resolution-orientation'

describe('resolution orientation hints', () => {
  it('classifies landscape, portrait, and square tags', () => {
    expect(resolutionOrientation(800, 480)).toBe('landscape')
    expect(resolutionOrientation(168, 384)).toBe('portrait')
    expect(resolutionOrientation(152, 152)).toBe('square')
  })

  it('provides human-readable hint labels', () => {
    expect(resolutionOrientationHint(800, 480)).toBe('Landscape')
    expect(resolutionOrientationHint(168, 384)).toBe('Portrait')
    expect(resolutionOrientationHint(200, 200)).toBe('Square')
  })
})
