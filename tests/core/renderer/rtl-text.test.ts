import { describe, expect, it } from 'vitest'
import { computeOpentypeGlyphPositions } from '../../../src/core/renderer/opentype-glyphs'
import { measureTextWidth } from '../../../src/core/renderer/text-layout'
import { loadBundledTestFont } from './font-test-utils'

describe('RTL opentype glyph positions', () => {
  it('places Hebrew visually with the first logical letter on the right', () => {
    const font = loadBundledTestFont('ppb.ttf')
    const text = 'כג'
    const fontSize = 24
    const lineX = 10
    const lineWidth = measureTextWidth(font, text, fontSize)
    const positions = computeOpentypeGlyphPositions(font, text, fontSize, lineX, 50)

    expect(positions.length).toBeGreaterThanOrEqual(2)
    expect(positions[0]!.x).toBeLessThan(positions[1]!.x)
    expect(positions[1]!.x + 1).toBeGreaterThan(lineX + lineWidth - 12)
  })

  it('places Latin left-to-right', () => {
    const font = loadBundledTestFont('ppb.ttf')
    const text = 'Hi'
    const fontSize = 24
    const lineX = 10
    const positions = computeOpentypeGlyphPositions(font, text, fontSize, lineX, 50)

    expect(positions.length).toBeGreaterThanOrEqual(2)
    expect(positions[0]!.x).toBeLessThan(positions[1]!.x)
  })
})
