import { describe, expect, it } from 'vitest'
import { yamlEntityIdsFacet } from '../../../src/ui/editor/yamlEntityIds'

describe('yamlEntityIdsFacet', () => {
  it('uses the latest configured entity list', () => {
    const combined = yamlEntityIdsFacet.combine([
      [{ id: 'sensor.a' }],
      [{ id: 'sensor.a' }, { id: 'sensor.b', name: 'Sensor B' }],
    ])
    expect(combined).toEqual([{ id: 'sensor.a' }, { id: 'sensor.b', name: 'Sensor B' }])
  })
})
