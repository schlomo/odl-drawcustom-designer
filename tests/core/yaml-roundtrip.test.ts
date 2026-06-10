import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  parseYamlPayload,
  roundTripYaml,
  serializeYamlPayload,
  validatePayload,
  DESIGNER_ONLY_FIELDS,
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
  it('uses plain scalars when quoting is not required', () => {
    const exported = serializeYamlPayload([
      { type: 'text', value: 'Hello', x: 40, y: 20, size: 20, fill: 'red' },
    ])
    expect(exported).toContain('fill: red')
    expect(exported).toContain('size: 20')
    expect(exported).not.toContain('"type":')
  })

  it('quotes template strings without quoting every key', () => {
    const exported = serializeYamlPayload([
      { type: 'text', value: 'Hi', x: 0, size: '{{ }}' },
    ])
    expect(exported).toContain('size: "{{ }}"')
    expect(exported).not.toContain('"type":')
  })

  it('strips all designer-only fields from exported YAML', () => {
    const elements = parseYamlPayload(`
- type: text
  value: Hello
  x: 0
  y: 0
  preview_data_url: data:image/png;base64,abc
  _yaml_comments:
    value: preview comment
  _designer_meta: should not export
`)

    const exported = serializeYamlPayload(elements)
    for (const field of DESIGNER_ONLY_FIELDS) {
      expect(exported).not.toContain(field)
    }
    expect(exported).not.toMatch(/^_/m)
    expect(validatePayload(parseYamlPayload(exported)).success).toBe(true)
  })
})
