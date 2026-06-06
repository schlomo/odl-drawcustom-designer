import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderLine } from '../../../src/core/renderer/line'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')

const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderLine', () => {
  it('renders spec fixture line-minimal.yaml', () => {
    const [element] = parseYamlPayload(readFileSync(join(fixtureDir, 'line-minimal.yaml'), 'utf8'))
    if (element.type !== 'line') throw new Error('expected line element')

    const result = renderLine(element, context)

    expect(result).toEqual({
      layer: 'svg',
      primitive: {
        kind: 'line',
        x1: 20,
        y1: 0,
        x2: 380,
        y2: 0,
        stroke: '#000000',
        strokeWidth: 1,
      },
    })
  })

  it('resolves percentage coordinates', () => {
    const result = renderLine(
      {
        type: 'line',
        x_start: '50%',
        x_end: '100%',
        y_start: '25%',
        y_end: '75%',
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      x1: 200,
      x2: 400,
      y1: 50,
      y2: 150,
    })
  })
})
