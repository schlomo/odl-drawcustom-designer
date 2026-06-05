import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderDlimg } from '../../../src/core/renderer/dlimg'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderDlimg', () => {
  it('renders spec fixture dlimg-minimal.yaml', () => {
    const [element] = parseYamlPayload(readFileSync(join(fixtureDir, 'dlimg-minimal.yaml'), 'utf8'))
    if (element.type !== 'dlimg') throw new Error('expected dlimg element')

    const result = renderDlimg(element, context)

    expect(result).toEqual({
      layer: 'canvas',
      primitive: {
        kind: 'dlimg-stub',
        x: 10,
        y: 10,
        width: 120,
        height: 120,
        url: 'https://example.com/logo.png',
        rotate: 0,
      },
    })
  })
})
