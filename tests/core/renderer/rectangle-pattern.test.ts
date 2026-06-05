import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderRectanglePattern } from '../../../src/core/renderer/rectangle-pattern'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderRectanglePattern', () => {
  it('renders spec fixture rectangle-pattern-minimal.yaml', () => {
    const [element] = parseYamlPayload(
      readFileSync(join(fixtureDir, 'rectangle-pattern-minimal.yaml'), 'utf8'),
    )
    if (element.type !== 'rectangle_pattern') throw new Error('expected rectangle_pattern element')

    const result = renderRectanglePattern(element, context)

    expect(result?.layer).toBe('svg')
    expect(result?.primitive.kind).toBe('rectangle-pattern-stub')
    expect(result?.primitive.rects).toHaveLength(4)
    expect(result?.primitive.rects[0]).toMatchObject({
      x: 5,
      y: 28,
      width: 35,
      height: 18,
      fill: '#FFFFFF',
      stroke: '#FF0000',
      strokeWidth: 1,
    })
    expect(result?.primitive.rects[3]?.y).toBe(88)
  })
})
