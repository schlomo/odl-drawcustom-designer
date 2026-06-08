import { describe, expect, it } from 'vitest'
import {
  applyPlotPropertyUpdate,
  getPropertyEffectiveValue,
  getVisibleProperties,
} from '../../../src/core/schema/propertyMetadata'
import type { DrawElement } from '../../../src/core/schema/elements'

const plot: DrawElement = {
  type: 'plot',
  data: [{ entity: 'sensor.temperature' }],
}

describe('plot nested property metadata (19-5)', () => {
  it('surfaces structured yaxis and ylegend fields instead of JSON blobs', () => {
    const keys = getVisibleProperties(plot)
    expect(keys).toContain('yaxis.grid')
    expect(keys).toContain('ylegend.position')
    expect(keys).toContain('size')
    expect(keys).toContain('font')
    expect(keys).toContain('low')
    expect(keys).toContain('high')
    expect(keys).not.toContain('yaxis')
    expect(keys).not.toContain('ylegend')
  })

  it('reads and writes nested plot properties', () => {
    const updated = applyPlotPropertyUpdate(plot, 'yaxis.grid', 4)
    expect(getPropertyEffectiveValue(updated, 'yaxis.grid')).toBe(4)
    expect((updated as Extract<DrawElement, { type: 'plot' }>).yaxis).toEqual({ grid: 4 })
  })
})
