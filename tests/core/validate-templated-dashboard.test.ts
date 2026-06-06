import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseYamlPayload, validatePayload } from '../../src/core'
import {
  getYamlElementsParseIssues,
  tryParseYamlElements,
} from '../../src/ui/editor/yamlElementsSync'

const fixtureDir = dirname(fileURLToPath(import.meta.url))
const fixtureYaml = readFileSync(
  join(fixtureDir, '../fixtures/spec/templated-dashboard.yaml'),
  'utf8',
)

describe('templated dashboard fixture', () => {
  it('validates a multi-element layout with templated icon size', () => {
    const parsed = tryParseYamlElements(fixtureYaml)
    expect(parsed).not.toBeNull()
    expect(parsed).toHaveLength(13)
    expect(getYamlElementsParseIssues(fixtureYaml)).toEqual([])
    expect(validatePayload(parseYamlPayload(fixtureYaml)).success).toBe(true)
  })
})
