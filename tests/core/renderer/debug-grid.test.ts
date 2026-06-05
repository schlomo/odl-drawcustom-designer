import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderDebugGrid } from '../../../src/core/renderer/debug-grid'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderDebugGrid', () => {
  it('renders spec fixture debug-grid-minimal.yaml', () => {
    const [element] = parseYamlPayload(
      readFileSync(join(fixtureDir, 'debug-grid-minimal.yaml'), 'utf8'),
    )
    if (element.type !== 'debug_grid') throw new Error('expected debug_grid element')

    const result = renderDebugGrid(element, context)

    expect(result).toEqual({
      layer: 'svg',
      primitive: {
        kind: 'debug-grid-stub',
        width: 400,
        height: 200,
        spacing: 20,
        stroke: '#000000',
      },
    })
  })
})
