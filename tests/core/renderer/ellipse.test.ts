import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderEllipse } from '../../../src/core/renderer/ellipse'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderEllipse', () => {
  it('renders spec fixture ellipse-minimal.yaml', () => {
    const [element] = parseYamlPayload(
      readFileSync(join(fixtureDir, 'ellipse-minimal.yaml'), 'utf8'),
    )
    if (element.type !== 'ellipse') throw new Error('expected ellipse element')

    const result = renderEllipse(element, context)

    expect(result).toEqual({
      layer: 'svg',
      primitive: {
        kind: 'ellipse',
        cx: 75,
        cy: 75,
        rx: 25,
        ry: 25,
        fill: null,
        stroke: '#000000',
        strokeWidth: 1,
      },
    })
  })
})
