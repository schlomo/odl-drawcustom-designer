import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderIconSequence } from '../../../src/core/renderer/icon-sequence'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderIconSequence', () => {
  it('renders spec fixture icon-sequence-minimal.yaml', () => {
    const [element] = parseYamlPayload(
      readFileSync(join(fixtureDir, 'icon-sequence-minimal.yaml'), 'utf8'),
    )
    if (element.type !== 'icon_sequence') throw new Error('expected icon_sequence element')

    const result = renderIconSequence(element, context)

    expect(result).toEqual({
      layer: 'svg',
      primitive: {
        kind: 'icon-sequence-stub',
        x: 10,
        y: 10,
        size: 24,
        icons: ['mdi:home', 'mdi:arrow-right', 'mdi:office-building'],
        direction: 'right',
        spacing: 24,
        fill: '#000000',
      },
    })
  })
})
