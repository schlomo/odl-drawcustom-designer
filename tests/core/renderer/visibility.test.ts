import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../../../src/core/renderer'
import { CROSS_CUTTING_ELEMENT_FIELDS, DRAW_ELEMENT_TYPES, PROPERTIES_BY_TYPE } from '../../../src/core/schema'
import { getVisibleProperties } from '../../../src/core/schema/propertyMetadata'
import { isVisible } from '../../../src/core/renderer/visibility'
import type { RenderContext } from '../../../src/core/renderer/types'
import { parseYamlPayload } from '../../../src/core/yaml'

const context: RenderContext = { width: 400, height: 200, colorMode: 'bwr' }

const visibilityFixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/elements/visibility',
)

function loadVisibilityFixture(type: (typeof DRAW_ELEMENT_TYPES)[number]) {
  const yaml = readFileSync(join(visibilityFixtureDir, `${type}.yaml`), 'utf8')
  const [element] = parseYamlPayload(yaml)
  expect(element.type).toBe(type)
  expect(element).toMatchObject({ visible: false })
  return element
}

describe('renderer visibility', () => {
  it('treats unevaluated visible templates as visible until preview', () => {
    expect(
      isVisible("{{ iif(is_state('binary_sensor.door', 'on'), true, false) }}"),
    ).toBe(true)
  })

  it('lists visible as a cross-cutting field on every draw type', () => {
    for (const type of DRAW_ELEMENT_TYPES) {
      for (const field of CROSS_CUTTING_ELEMENT_FIELDS) {
        expect(PROPERTIES_BY_TYPE[type]).toContain(field)
      }
    }
  })

  it.each(DRAW_ELEMENT_TYPES)('returns null for %s when visible is false', (type) => {
    const element = loadVisibilityFixture(type)
    expect(renderElement(element, context)).toBeNull()
  })

  it('shows visible toggle in property panel for polygon, arc, and debug_grid', () => {
    expect(
      getVisibleProperties({
        type: 'polygon',
        points: [[0, 0], [10, 0], [10, 10]],
      }),
    ).toContain('visible')
    expect(
      getVisibleProperties({
        type: 'arc',
        x: 0,
        y: 0,
        radius: 10,
        start_angle: 0,
        end_angle: 90,
      }),
    ).toContain('visible')
    expect(getVisibleProperties({ type: 'debug_grid' })).toContain('visible')
  })
})
