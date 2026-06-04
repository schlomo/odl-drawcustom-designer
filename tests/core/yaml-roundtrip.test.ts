import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseYamlPayload, roundTripYaml } from '../../src/core/yaml/stub'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/spec')

describe('golden YAML round-trip (text-minimal)', () => {
  const source = readFileSync(join(fixtureDir, 'text-minimal.yaml'), 'utf8')

  it('parses the minimal text element from supported_types.md', () => {
    const elements = parseYamlPayload(source)
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({
      type: 'text',
      value: 'Hello World!',
      font: 'ppb.ttf',
      x: 0,
      y: 0,
      size: 40,
      color: 'red',
    })
  })

  it('round-trips fixture without semantic loss', () => {
    const roundTripped = roundTripYaml(source)
    const reparsed = parseYamlPayload(roundTripped)
    expect(reparsed).toEqual(parseYamlPayload(source))
  })
})
