import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderArc } from '../../../src/core/renderer/arc'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderArc', () => {
  it('renders spec fixture arc-minimal.yaml', () => {
    const [element] = parseYamlPayload(readFileSync(join(fixtureDir, 'arc-minimal.yaml'), 'utf8'))
    if (element.type !== 'arc') throw new Error('expected arc element')

    const result = renderArc(element, context)

    expect(result).toEqual({
      layer: 'svg',
      primitive: {
        kind: 'arc',
        cx: 100,
        cy: 75,
        r: 50,
        startAngle: 0,
        endAngle: 90,
        fill: '#FF0000',
        stroke: '#000000',
        strokeWidth: 1,
      },
    })
  })
})
