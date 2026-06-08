import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseYamlPayload } from '../../../src/core/yaml'
import { renderText } from '../../../src/core/renderer/text'
import type { CanvasTextStubPrimitive } from '../../../src/core/renderer/types'

const fixtureRoot = join(import.meta.dirname, '../../fixtures/spec')

describe('parse_colors text rendering', () => {
  it('renders multi-color segments from fixture YAML', () => {
    const yaml = readFileSync(join(fixtureRoot, 'parse-colors-text.yaml'), 'utf8')
    const elements = parseYamlPayload(yaml)
    const element = elements[0]
    expect(element.type).toBe('text')

    const result = renderText(element, { width: 400, height: 200, accentMode: 'red' })
    expect(result?.layer).toBe('canvas')

    const primitive = result?.primitive as CanvasTextStubPrimitive
    expect(primitive.parseColors).toBe(true)
    expect(primitive.drawLines[0]?.colorSegments).toEqual([
      { text: 'Current temp: ', visualText: 'Current temp: ', color: 'black', x: expect.any(Number) },
      { text: '25°C', visualText: '25°C', color: 'accent', x: expect.any(Number) },
    ])
  })

  it('keeps accent segment names for yellow tag preview', () => {
    const yaml = readFileSync(join(fixtureRoot, 'parse-colors-text.yaml'), 'utf8')
    const elements = parseYamlPayload(yaml)
    const result = renderText(elements[0], { width: 400, height: 200, accentMode: 'yellow' })
    const primitive = result?.primitive as CanvasTextStubPrimitive
    expect(primitive.drawLines[0]?.colorSegments?.[1]?.color).toBe('accent')
  })
})
