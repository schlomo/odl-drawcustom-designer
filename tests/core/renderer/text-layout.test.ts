import { describe, expect, it } from 'vitest'
import { getFont } from '../../../src/core/renderer/fonts'
import { renderMultiline } from '../../../src/core/renderer/multiline'
import { renderText } from '../../../src/core/renderer/text'
import { layoutTextBlock, measureTextWidth, wrapTextLines } from '../../../src/core/renderer/text-layout'
import type { RenderContext } from '../../../src/core/renderer/types'
import { loadBundledTestFont } from './font-test-utils'

const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('text layout (opentype.js)', () => {
  it('has bundled ppb.ttf registered from the test setup', () => {
    expect(getFont('ppb.ttf')).toBeDefined()
  })

  it('measures glyph advance width for ppb.ttf', () => {
    const font = loadBundledTestFont()
    const width = measureTextWidth(font, 'Hello', 20)
    expect(width).toBeGreaterThan(40)
    expect(width).toBeLessThan(80)
  })

  it('wraps long text at max_width into multiple lines', () => {
    const font = loadBundledTestFont()
    const text = 'The quick brown fox jumps over the lazy dog'
    const wrapped = wrapTextLines(font, text, 16, 120)
    expect(wrapped.length).toBeGreaterThan(1)
    for (const line of wrapped) {
      expect(measureTextWidth(font, line, 16)).toBeLessThanOrEqual(120.5)
    }
  })

  it('truncates with ellipsis when truncate is enabled', () => {
    const font = loadBundledTestFont()
    const layout = layoutTextBlock(font, 'Temperature reading 42 degrees', {
      fontSize: 18,
      maxWidth: 90,
      truncate: true,
    })

    expect(layout.lines).toHaveLength(1)
    expect(layout.lines[0]?.text.endsWith('...')).toBe(true)
    expect(measureTextWidth(font, layout.lines[0]!.text, 18)).toBeLessThanOrEqual(90.5)
  })

  it('renders wrapped text with more than one draw line', () => {
    const result = renderText(
      {
        type: 'text',
        value: 'Wrap this long headline on the dashboard',
        x: 20,
        y: 30,
        size: 16,
        font: 'ppb.ttf',
        max_width: 100,
        spacing: 4,
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'text-stub',
    })
    if (result?.primitive.kind === 'text-stub') {
      expect(result.primitive.drawLines.length).toBeGreaterThan(1)
      expect(result.primitive.width).toBeLessThanOrEqual(100.5)
    }
  })

  it('renders multiline delimiter stack with measured height', () => {
    const result = renderMultiline(
      {
        type: 'multiline',
        value: 'One|Two|Three',
        delimiter: '|',
        x: 10,
        offset_y: 40,
        size: 20,
        font: 'ppb.ttf',
        spacing: 6,
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'multiline-stub',
    })
    if (result?.primitive.kind === 'multiline-stub') {
      expect(result.primitive.lines).toEqual(['One', 'Two', 'Three'])
      expect(result.primitive.drawLines).toHaveLength(3)
      expect(result.primitive.height).toBeGreaterThan(60)
    }
  })
})
