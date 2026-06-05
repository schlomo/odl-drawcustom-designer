import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderQrcode } from '../../../src/core/renderer/qrcode'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderQrcode', () => {
  it('renders spec fixture qrcode-minimal.yaml', () => {
    const [element] = parseYamlPayload(
      readFileSync(join(fixtureDir, 'qrcode-minimal.yaml'), 'utf8'),
    )
    if (element.type !== 'qrcode') throw new Error('expected qrcode element')

    const result = renderQrcode(element, context)

    expect(result).toEqual({
      layer: 'canvas',
      primitive: {
        kind: 'qrcode-stub',
        x: 140,
        y: 50,
        width: 50,
        height: 50,
        data: 'https://www.example.com',
        color: '#000000',
        bgcolor: '#FFFFFF',
      },
    })
  })
})
