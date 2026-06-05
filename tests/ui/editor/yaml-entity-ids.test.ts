import { describe, expect, it } from 'vitest'
import { yamlEntityIdsFacet } from '../../../src/ui/editor/yamlEntityIds'

describe('yamlEntityIdsFacet', () => {
  it('uses the latest configured entity id list', () => {
    const combined = yamlEntityIdsFacet.combine([
      ['sensor.a'],
      ['sensor.a', 'sensor.b'],
    ])
    expect(combined).toEqual(['sensor.a', 'sensor.b'])
  })
})
