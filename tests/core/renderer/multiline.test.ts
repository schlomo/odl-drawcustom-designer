import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderMultiline } from '../../../src/core/renderer/multiline'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderMultiline', () => {
  it('renders spec fixture multiline-minimal.yaml', () => {
    const [element] = parseYamlPayload(
      readFileSync(join(fixtureDir, 'multiline-minimal.yaml'), 'utf8'),
    )
    if (element.type !== 'multiline') throw new Error('expected multiline element')

    const result = renderMultiline(element, context)

    expect(result).toEqual({
      layer: 'canvas',
      primitive: {
        kind: 'multiline-stub',
        x: 0,
        y: 50,
        width: 132,
        height: 144,
        lines: ['Line 1', 'Line 2', 'Line 3'],
        color: '#000000',
        fontSize: 40,
        font: 'ppb.ttf',
      },
    })
  })

  it('returns null when visible is false', () => {
    const result = renderMultiline(
      {
        type: 'multiline',
        value: 'a|b',
        delimiter: '|',
        x: 0,
        offset_y: 0,
        visible: false,
      },
      context,
    )
    expect(result).toBeNull()
  })
})
