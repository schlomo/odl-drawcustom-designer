import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderRectangle } from '../../../src/core/renderer/rectangle'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')

const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderRectangle', () => {
  it('renders spec fixture rectangle-minimal.yaml', () => {
    const [element] = parseYamlPayload(
      readFileSync(join(fixtureDir, 'rectangle-minimal.yaml'), 'utf8'),
    )
    if (element.type !== 'rectangle') throw new Error('expected rectangle element')

    const result = renderRectangle(element, context)

    expect(result).toEqual({
      layer: 'svg',
      primitive: {
        kind: 'rect',
        x: 20,
        y: 15,
        width: 60,
        height: 15,
        fill: '#FF0000',
        stroke: '#000000',
        strokeWidth: 2,
      },
    })
  })

  it('returns null when visible is false', () => {
    const result = renderRectangle(
      {
        type: 'rectangle',
        x_start: 0,
        x_end: 10,
        y_start: 0,
        y_end: 10,
        visible: 'false',
      },
      context,
    )
    expect(result).toBeNull()
  })
})
