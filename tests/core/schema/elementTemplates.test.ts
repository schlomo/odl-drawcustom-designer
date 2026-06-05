import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DRAW_ELEMENT_TYPES } from '../../../src/core/schema/elements'
import {
  getElementTypeInsertion,
  getElementTypeInsertionForBlock,
} from '../../../src/core/schema/elementTemplates'
import { parseYamlPayload, validatePayload } from '../../../src/core/yaml'

const FIXTURES_DIR = join(process.cwd(), 'tests/fixtures/spec')

function listItemYamlFromInsertion(insertion: string): string {
  const [typeLine, ...rest] = insertion.split('\n')
  return `- type: ${typeLine}\n${rest.join('\n')}`
}

function readMinimalFixture(type: (typeof DRAW_ELEMENT_TYPES)[number]): string {
  const fileName = type === 'debug_grid' ? 'debug-grid' : type.replace(/_/g, '-')
  return readFileSync(join(FIXTURES_DIR, `${fileName}-minimal.yaml`), 'utf8').trimEnd()
}

describe('getElementTypeInsertion', () => {
  it('covers every draw element type', () => {
    for (const type of DRAW_ELEMENT_TYPES) {
      expect(getElementTypeInsertion(type)).toBeTruthy()
    }
  })

  it.each(DRAW_ELEMENT_TYPES.map((type) => [type] as const))(
    'matches the golden minimal fixture for %s',
    (type) => {
      const insertion = getElementTypeInsertion(type)
      const fromInsertion = listItemYamlFromInsertion(insertion)
      const fixture = readMinimalFixture(type)
      expect(fromInsertion).toBe(fixture)
    },
  )

  it('inserts only missing keys when converting an existing block', () => {
    const lineBlock = `- type: line
  x_start: 10
  x_end: 250
  y_start: 140
  y_end: 140
  width: 2
  fill: black`

    expect(getElementTypeInsertionForBlock('rectangle', lineBlock)).toBe(`rectangle
  outline: black`)
  })

  it('keeps the full template for a new list item', () => {
    expect(getElementTypeInsertionForBlock('rectangle', '- type: ')).toBe(
      getElementTypeInsertion('rectangle'),
    )
  })

  it('produces a valid single-element payload', () => {
    for (const type of DRAW_ELEMENT_TYPES) {
      const yaml = `${listItemYamlFromInsertion(getElementTypeInsertion(type))}\n`
      const parsed = parseYamlPayload(yaml)
      const result = validatePayload(parsed)
      expect(result.success, type).toBe(true)
    }
  })
})
