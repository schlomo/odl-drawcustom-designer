import { describe, expect, it } from 'vitest'
import {
  isAtJinjaTemplateStart,
  isAtLoneOpenBrace,
  isInTemplateCapableYamlValue,
  isInsideJinjaTemplate,
} from '../../../src/ui/editor/jinjaContext'

function mockContext(doc: string, pos: number, explicit = false) {
  return {
    state: {
      doc: {
        toString: () => doc,
        lineAt: (p: number) => {
          const lines = doc.split('\n')
          let offset = 0
          for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index] ?? ''
            const end = offset + line.length
            if (p <= end) {
              return { from: offset, text: line }
            }
            offset = end + 1
          }
          return { from: 0, text: lines[0] ?? '' }
        },
      },
      sliceDoc: (from: number, to: number) => doc.slice(from, to),
    },
    pos,
    explicit,
  } as never
}

describe('isInsideJinjaTemplate', () => {
  it('returns true inside double-brace expressions', () => {
    const doc = '  value: "{{ states(\'sensor.x\') }}"'
    const pos = doc.indexOf('states')
    expect(isInsideJinjaTemplate(mockContext(doc, pos))).toBe(true)
  })

  it('returns false for plain quoted yaml strings', () => {
    const doc = '  color: "red"'
    const pos = doc.length
    expect(isInsideJinjaTemplate(mockContext(doc, pos))).toBe(false)
  })

  it('returns false after closing a plain quoted yaml string', () => {
    const doc = `  color: "red"
- type: rectan`
    const pos = doc.indexOf('"', doc.indexOf('color')) + 1
    expect(isInsideJinjaTemplate(mockContext(doc, pos))).toBe(false)
  })

  it('returns false on yaml structure lines without templates', () => {
    const doc = '- type: text'
    expect(isInsideJinjaTemplate(mockContext(doc, doc.length))).toBe(false)
  })
})

describe('isAtLoneOpenBrace', () => {
  it('detects a single { at the end of an unquoted yaml value', () => {
    const doc = '  y_start: 50 {'
    expect(isAtLoneOpenBrace(mockContext(doc, doc.length))).toBe(true)
  })

  it('returns false after {{ or {%', () => {
    const expression = '  value: "{{'
    const statement = '  size: 32 {%'
    expect(isAtLoneOpenBrace(mockContext(expression, expression.length))).toBe(false)
    expect(isAtLoneOpenBrace(mockContext(statement, statement.length))).toBe(false)
  })

  it('returns false on yaml structure lines', () => {
    const doc = '- type: text {'
    expect(isAtLoneOpenBrace(mockContext(doc, doc.length))).toBe(false)
  })
})

describe('isInTemplateCapableYamlValue', () => {
  it('returns true inside quoted values and after key colons', () => {
    expect(isInTemplateCapableYamlValue(mockContext('  color: "red {', 14))).toBe(true)
    expect(isInTemplateCapableYamlValue(mockContext('  y_start: 50 {', 14))).toBe(true)
  })
})

describe('isAtJinjaTemplateStart', () => {
  it('detects when the cursor is right after opening braces', () => {
    const doc = '  value: "{{ '
    expect(isAtJinjaTemplateStart(mockContext(doc, doc.length))).toBe(true)
  })

  it('detects when the cursor is right after an opening statement tag', () => {
    const doc = '  size: 32 {%'
    expect(isAtJinjaTemplateStart(mockContext(doc, doc.length))).toBe(true)
  })
})

describe('isInsideJinjaTemplate for statement tags', () => {
  it('returns true inside an unclosed {% statement', () => {
    const doc = '  size: 32 {%'
    expect(isInsideJinjaTemplate(mockContext(doc, doc.length))).toBe(true)
  })

  it('returns true while editing a set statement', () => {
    const doc = '  value: "{% set temp = states('
    const pos = doc.indexOf('states')
    expect(isInsideJinjaTemplate(mockContext(doc, pos))).toBe(true)
  })
})
