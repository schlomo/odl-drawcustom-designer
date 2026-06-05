import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  parseYamlPayload,
  roundTripYaml,
  serializeYamlPayload,
  validatePayload,
} from '../../src/core/yaml'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/spec')

const fixtureFiles = readdirSync(fixtureDir)
  .filter((name) => name.endsWith('.yaml'))
  .sort()

describe('golden YAML round-trip (all spec fixtures)', () => {
  it.each(fixtureFiles)('%s validates and round-trips without semantic loss', (filename) => {
    const source = readFileSync(join(fixtureDir, filename), 'utf8')
    const parsed = parseYamlPayload(source)
    const validation = validatePayload(parsed)

    expect(validation.success, validation.success ? undefined : validation.issues.join('; ')).toBe(
      true,
    )

    const roundTripped = roundTripYaml(source)
    const reparsed = parseYamlPayload(roundTripped)
    expect(reparsed).toEqual(parsed)
  })
})

describe('HA-clean serialize', () => {
  it('strips designer-only fields from exported YAML', () => {
    const elements = parseYamlPayload(`
- type: text
  value: Hello
  x: 0
  y: 0
  preview_data_url: data:image/png;base64,abc
  _yaml_comments:
    value: preview comment
`)

    const exported = serializeYamlPayload(elements)
    expect(exported).not.toContain('preview_data_url')
    expect(exported).not.toContain('_yaml_comments')
    expect(validatePayload(parseYamlPayload(exported)).success).toBe(true)
  })
})
