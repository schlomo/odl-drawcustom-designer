import { describe, expect, it } from 'vitest'
import {
  measureInkBoundingBox,
  positionTextBlockAtAnchor,
} from '../../../src/core/renderer/text-ink-bounds'
import { getFontMetrics, layoutTextBlock } from '../../../src/core/renderer/text-layout'
import { loadBundledTestFont } from './font-test-utils'

describe('text ink bounds (Pillow textbbox parity)', () => {
  const font = loadBundledTestFont('rbm.ttf')
  const fontSize = 24
  const hebrew = "ב' תמוז ה' תשפ\"ו"

  it('measures ink height smaller than font-table line height', () => {
    const ink = measureInkBoundingBox(font, hebrew, fontSize)
    const metrics = getFontMetrics(font, fontSize)

    expect(ink.height).toBeLessThan(metrics.lineHeight)
    expect(ink.y2 - ink.y1).toBe(ink.height)
  })

  it('places lb anchor on ink bottom', () => {
    const layout = layoutTextBlock(font, hebrew, { fontSize })
    const anchorY = 182
    const { drawLines, bounds } = positionTextBlockAtAnchor(
      font,
      layout,
      fontSize,
      20,
      anchorY,
      'lb',
      0,
      'lt',
    )

    expect(bounds.y + bounds.height).toBeCloseTo(anchorY, 1)
    expect(drawLines[0]?.y).toBeGreaterThan(anchorY - fontSize)
  })

  it('places mb anchor on ink bottom with horizontal center', () => {
    const layout = layoutTextBlock(font, '17.06.2026 11:18', { fontSize })
    const anchorX = 400
    const anchorY = 180
    const { bounds } = positionTextBlockAtAnchor(
      font,
      layout,
      fontSize,
      anchorX,
      anchorY,
      'mb',
      0,
      'lt',
    )

    expect(bounds.y + bounds.height).toBeCloseTo(anchorY, 1)
    expect(bounds.x + bounds.width / 2).toBeCloseTo(anchorX, 1)
  })

  it('places mm anchor on ink vertical center', () => {
    const layout = layoutTextBlock(font, '17.06.2026 11:18', { fontSize })
    const anchorY = 180
    const { bounds } = positionTextBlockAtAnchor(
      font,
      layout,
      fontSize,
      400,
      anchorY,
      'mm',
      0,
      'lt',
    )

    expect(bounds.y + bounds.height / 2).toBeCloseTo(anchorY, 1)
  })

  it('places rb anchor on ink bottom-right', () => {
    const layout = layoutTextBlock(font, '17 °C', { fontSize: 62 })
    const anchorX = 376
    const anchorY = 132
    const { bounds } = positionTextBlockAtAnchor(
      font,
      layout,
      fontSize,
      anchorX,
      anchorY,
      'rb',
      0,
      'lt',
    )

    expect(bounds.x + bounds.width).toBeCloseTo(anchorX, 1)
    expect(bounds.y + bounds.height).toBeCloseTo(anchorY, 1)
  })

  it('uses metric ascender anchoring for la (not ink top)', () => {
    const layout = layoutTextBlock(font, hebrew, { fontSize })
    const anchorY = 40
    const metrics = getFontMetrics(font, fontSize)
    const { drawLines } = positionTextBlockAtAnchor(
      font,
      layout,
      fontSize,
      10,
      anchorY,
      'la',
      0,
      'lt',
    )

    expect(drawLines[0]?.y).toBeCloseTo(anchorY + metrics.ascender, 2)
  })

  it('shifts baseline down vs font-table lb (regression for HA ~5px gap)', () => {
    const layout = layoutTextBlock(font, hebrew, { fontSize })
    const anchorY = 182
    const metrics = getFontMetrics(font, fontSize)
    const metricBaseline = anchorY - layout.height + metrics.ascender
    const { drawLines } = positionTextBlockAtAnchor(
      font,
      layout,
      fontSize,
      20,
      anchorY,
      'lb',
      0,
      'lt',
    )

    expect(drawLines[0]?.y).toBeGreaterThan(metricBaseline)
    expect(drawLines[0]!.y - metricBaseline).toBeGreaterThan(4)
  })
})
