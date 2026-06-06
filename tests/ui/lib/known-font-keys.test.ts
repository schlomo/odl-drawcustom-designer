import { describe, expect, it } from 'vitest'
import { collectKnownFontKeys } from '../../../src/ui/lib/known-font-keys'

describe('collectKnownFontKeys', () => {
  it('includes bundled fonts and payload references', () => {
    expect(
      collectKnownFontKeys([
        {
          type: 'text',
          value: 'Hi',
          font: '/local/custom.ttf',
          x: 0,
          y: 0,
        },
      ]),
    ).toEqual(['/local/custom.ttf', 'ppb.ttf', 'rbm.ttf'])
  })
})
