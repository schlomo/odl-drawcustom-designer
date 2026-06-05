import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderIcon } from '../../../src/core/renderer/icon'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderIcon', () => {
  it('renders spec fixture icon-minimal.yaml', () => {
    const [element] = parseYamlPayload(readFileSync(join(fixtureDir, 'icon-minimal.yaml'), 'utf8'))
    if (element.type !== 'icon') throw new Error('expected icon element')

    const result = renderIcon(element, context)

    expect(result).toEqual({
      layer: 'svg',
      primitive: {
        kind: 'icon-stub',
        x: 60,
        y: 120,
        size: 120,
        value: 'account-cowboy-hat',
        fill: '#FF0000',
      },
    })
  })
})
