import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderText } from '../../../src/core/renderer/text'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')

const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderText', () => {
  it('renders spec fixture text-minimal.yaml as canvas stub', () => {
    const [element] = parseYamlPayload(readFileSync(join(fixtureDir, 'text-minimal.yaml'), 'utf8'))
    if (element.type !== 'text') throw new Error('expected text element')

    const result = renderText(element, context)

    expect(result?.layer).toBe('canvas')
    expect(result?.primitive).toMatchObject({
      kind: 'text-stub',
      x: 0,
      y: 0,
      value: 'Hello World!',
      color: '#FF0000',
      fontSize: 40,
      font: 'ppb.ttf',
    })
    expect(result?.primitive).toHaveProperty('width')
    expect(result?.primitive).toHaveProperty('height')
    expect((result?.primitive as { width: number }).width).toBeGreaterThan(0)
    expect((result?.primitive as { height: number }).height).toBeGreaterThan(0)
  })

  it('returns null when visible is false', () => {
    const result = renderText(
      {
        type: 'text',
        value: 'Hidden',
        x: 0,
        y: 0,
        visible: false,
      },
      context,
    )
    expect(result).toBeNull()
  })
})
