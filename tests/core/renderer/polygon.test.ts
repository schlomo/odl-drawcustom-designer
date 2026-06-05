import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderPolygon } from '../../../src/core/renderer/polygon'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderPolygon', () => {
  it('renders spec fixture polygon-minimal.yaml', () => {
    const [element] = parseYamlPayload(
      readFileSync(join(fixtureDir, 'polygon-minimal.yaml'), 'utf8'),
    )
    if (element.type !== 'polygon') throw new Error('expected polygon element')

    const result = renderPolygon(element, context)

    expect(result).toEqual({
      layer: 'svg',
      primitive: {
        kind: 'polygon',
        points: [
          [10, 10],
          [50, 10],
          [50, 50],
          [10, 50],
        ],
        fill: '#FF0000',
        stroke: '#000000',
        strokeWidth: 1,
      },
    })
  })
})
