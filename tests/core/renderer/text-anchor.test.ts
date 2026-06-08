import { describe, expect, it } from 'vitest'
import { iconSequenceBoxSize } from '../../../src/core/renderer/anchors'
import { renderIcon } from '../../../src/core/renderer/icon'
import { renderIconSequence } from '../../../src/core/renderer/icon-sequence'
import { renderText } from '../../../src/core/renderer/text'
import { getCanvasTextDrawStyle } from '../../../src/core/renderer/text-anchor-draw'
import type { RenderContext } from '../../../src/core/renderer/types'
import { getPrimitiveBounds } from '../../../src/ui/lib/primitive-bounds'
const context: RenderContext = { width: 880, height: 528, accentMode: 'red' }

describe('anchor rendering', () => {
  it('offsets text bounds for mm anchor', () => {
    const fontSize = 20
    const result = renderText(
      {
        type: 'text',
        value: 'Hi',
        x: 100,
        y: 50,
        size: fontSize,
        anchor: 'mm',
        font: 'ppb.ttf',
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'text-stub',
      x: 100 - result!.primitive.width / 2,
      y: 50 - result!.primitive.height / 2,
    })
  })

  it('offsets icon bounds for rm anchor', () => {
    const result = renderIcon(
      {
        type: 'icon',
        value: 'mdi:home',
        x: 30,
        y: 240,
        size: 30,
        anchor: 'rm',
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'icon-stub',
      x: 0,
      y: 225,
      size: 30,
    })
  })

  it('offsets icon_sequence bounds for mm anchor', () => {
    const size = 24
    const icons = ['a', 'b', 'c']
    const spacing = 8
    const { width, height } = iconSequenceBoxSize(size, icons.length, spacing, 'right')
    const result = renderIconSequence(
      {
        type: 'icon_sequence',
        x: 200,
        y: 100,
        icons,
        size,
        spacing,
        anchor: 'mm',
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'icon-sequence-stub',
      x: 200 - width / 2,
      y: 100 - height / 2,
    })
  })

  it('anchors rb to the bottom-right corner of the text box', () => {
    const fontSize = 20
    const value = '06.06.2026 23:44'
    const result = renderText(
      {
        type: 'text',
        value,
        x: 800,
        y: 480,
        size: fontSize,
        anchor: 'rb',
        font: 'ppb.ttf',
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'text-stub',
      x: 800 - result!.primitive.width,
      y: 480 - result!.primitive.height,
      anchorX: 800,
      anchorY: 480,
      anchor: 'rb',
    })
    expect(getCanvasTextDrawStyle('rb')).toEqual({
      textAlign: 'right',
      textBaseline: 'bottom',
    })
  })

  it('feeds anchored primitives into selection bounds', () => {
    const fontSize = 20
    const result = renderText(
      {
        type: 'text',
        value: 'Hi',
        x: 100,
        y: 50,
        size: fontSize,
        anchor: 'mm',
        font: 'ppb.ttf',
      },
      context,
    )

    expect(result).not.toBeNull()
    expect(getPrimitiveBounds(result!.primitive)).toEqual({
      x: result!.primitive.x,
      y: result!.primitive.y,
      width: result!.primitive.width,
      height: result!.primitive.height,
    })
  })
})
