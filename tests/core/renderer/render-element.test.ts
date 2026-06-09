import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../../../src/core/renderer'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const context: RenderContext = { width: 400, height: 200, colorMode: 'bwr' }

const fixtureFiles = readdirSync(fixtureDir)
  .filter((name) => name.endsWith('.yaml'))
  .sort()

describe('renderElement (all spec fixtures)', () => {
  it.each(fixtureFiles)('renders %s without error', (filename) => {
    const [element] = parseYamlPayload(readFileSync(join(fixtureDir, filename), 'utf8'))
    const result = renderElement(element, context)
    expect(result).not.toBeNull()
    expect(result?.layer).toMatch(/^(svg|canvas)$/)
    expect(result?.primitive).toHaveProperty('kind')
  })
})
