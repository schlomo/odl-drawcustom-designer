import { describe, expect, it } from 'vitest'
import { renderIconSequence } from '../../../src/core/renderer/icon-sequence'
import type { RenderContext } from '../../../src/core/renderer/types'

const context: RenderContext = { width: 400, height: 200, colorMode: 'bwr' }

describe('renderIconSequence', () => {
  it('emits one positioned icon per icons array entry', () => {
    const icons = ['mdi:home', 'mdi:arrow-right', 'mdi:office-building']
    const result = renderIconSequence(
      {
        type: 'icon_sequence',
        x: 10,
        y: 10,
        icons,
        size: 24,
      },
      context,
    )

    expect(result?.layer).toBe('svg')
    expect(result?.primitive.kind).toBe('icon_sequence')
    expect(result?.primitive.icons).toHaveLength(icons.length)
    expect(result?.primitive.icons.every((icon) => icon.path && icon.path.length > 0)).toBe(true)
  })

  it('lays icons out horizontally for direction right', () => {
    const result = renderIconSequence(
      {
        type: 'icon_sequence',
        x: 0,
        y: 0,
        icons: ['home', 'home'],
        size: 20,
        spacing: 10,
        direction: 'right',
      },
      context,
    )

    const [first, second] = result!.primitive.icons
    expect(first.x).toBe(0)
    expect(first.y).toBe(0)
    expect(second.x).toBe(30)
    expect(second.y).toBe(0)
  })

  it('lays icons out vertically for direction down', () => {
    const result = renderIconSequence(
      {
        type: 'icon_sequence',
        x: 5,
        y: 5,
        icons: ['home', 'home'],
        size: 20,
        spacing: 10,
        direction: 'down',
      },
      context,
    )

    const [first, second] = result!.primitive.icons
    expect(first.x).toBe(5)
    expect(first.y).toBe(5)
    expect(second.x).toBe(5)
    expect(second.y).toBe(35)
  })
})
