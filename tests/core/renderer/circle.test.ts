import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderCircle } from '../../../src/core/renderer/circle'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')

const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderCircle', () => {
  it('renders spec fixture circle-minimal.yaml', () => {
    const [element] = parseYamlPayload(readFileSync(join(fixtureDir, 'circle-minimal.yaml'), 'utf8'))
    if (element.type !== 'circle') throw new Error('expected circle element')

    const result = renderCircle(element, context)

    expect(result).toEqual({
      layer: 'svg',
      primitive: {
        kind: 'circle',
        cx: 50,
        cy: 50,
        r: 20,
        fill: null,
        stroke: '#000000',
        strokeWidth: 1,
      },
    })
  })

  it('returns null when visible is false', () => {
    const result = renderCircle(
      {
        type: 'circle',
        x: 10,
        y: 10,
        radius: 5,
        visible: false,
      },
      context,
    )
    expect(result).toBeNull()
  })
})
