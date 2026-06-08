import { beforeEach, describe, expect, it } from 'vitest'
import { resetContentMap, setAsset } from '../../../src/core'
import { collectKnownFontKeys } from '../../../src/ui/lib/known-font-keys'

describe('collectKnownFontKeys', () => {
  beforeEach(() => {
    resetContentMap()
  })

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

  it('includes uploaded library fonts not used in the current design', () => {
    setAsset('Comic Sans MS.ttf', {
      blob: new Blob(['font'], { type: 'font/ttf' }),
      mime: 'font/ttf',
    })

    expect(
      collectKnownFontKeys([
        {
          type: 'text',
          value: 'Hi',
          font: 'ppb.ttf',
          x: 0,
          y: 0,
        },
      ]),
    ).toEqual(['Comic Sans MS.ttf', 'ppb.ttf', 'rbm.ttf'])
  })
})
