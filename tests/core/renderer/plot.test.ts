import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderPlot } from '../../../src/core/renderer/plot'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderPlot', () => {
  it('renders spec fixture plot-minimal.yaml', () => {
    const [element] = parseYamlPayload(readFileSync(join(fixtureDir, 'plot-minimal.yaml'), 'utf8'))
    if (element.type !== 'plot') throw new Error('expected plot element')

    const result = renderPlot(element, context)

    expect(result).toEqual({
      layer: 'canvas',
      primitive: {
        kind: 'plot-stub',
        x: 10,
        y: 20,
        width: 189,
        height: 99,
        seriesCount: 2,
      },
    })
  })
})
