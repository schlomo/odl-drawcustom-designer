import { describe, expect, it } from 'vitest'
import { findPresetForCanvas } from '../../../src/ui/data/display-presets'

describe('findPresetForCanvas', () => {
  it('distinguishes BWR and BWY presets that share dimensions', () => {
    expect(findPresetForCanvas(880, 528, 'red')?.id).toBe('7.5-bwr')
    expect(findPresetForCanvas(880, 528, 'yellow')?.id).toBe('7.5-bwy')
  })

  it('returns unique presets by dimensions alone', () => {
    expect(findPresetForCanvas(384, 184, 'red')?.id).toBe('2.9-184')
    expect(findPresetForCanvas(384, 184, 'yellow')?.id).toBe('2.9-184')
  })

  it('falls back to custom BWR/BWY for unknown dimensions', () => {
    expect(findPresetForCanvas(565, 480, 'red').id).toBe('custom-bwr')
    expect(findPresetForCanvas(565, 480, 'yellow').id).toBe('custom-bwy')
  })
})
