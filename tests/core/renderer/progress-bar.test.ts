import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderProgressBar } from '../../../src/core/renderer/progress-bar'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderProgressBar', () => {
  it('renders spec fixture progress-bar-minimal.yaml', () => {
    const [element] = parseYamlPayload(
      readFileSync(join(fixtureDir, 'progress-bar-minimal.yaml'), 'utf8'),
    )
    if (element.type !== 'progress_bar') throw new Error('expected progress_bar element')

    const result = renderProgressBar(element, context)

    expect(result?.layer).toBe('svg')
    expect(result?.primitive.fill.width).toBeCloseTo(113.4, 5)
    expect(result?.primitive).toMatchObject({
      kind: 'progress-bar-stub',
      progress: 42,
      showPercentage: true,
      background: {
        kind: 'rect',
        x: 10,
        y: 10,
        width: 270,
        height: 20,
        fill: '#FFFFFF',
        stroke: '#000000',
        strokeWidth: 1,
      },
      fill: {
        kind: 'rect',
        x: 10,
        y: 10,
        height: 20,
        fill: '#FF0000',
      },
    })
  })
})
