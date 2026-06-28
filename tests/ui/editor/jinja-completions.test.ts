import { describe, expect, it } from 'vitest'
import {
  HA_DELIMITER_COMPLETIONS,
  HA_EXPRESSION_COMPLETIONS,
  HA_FILTER_COMPLETIONS,
  HA_NOW_METHOD_COMPLETIONS,
  HA_TAG_COMPLETIONS,
  resolveJinjaCompletionContext,
} from '../../../src/ui/editor/jinjaCompletions'

function mockContext(doc: string, pos: number, explicit = false) {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1
  const lineText = doc.slice(lineStart, doc.indexOf('\n', pos) === -1 ? doc.length : doc.indexOf('\n', pos))

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
    matchBefore: (pattern: RegExp) => {
      const lineBefore = lineText.slice(0, pos - lineStart)
      const match = lineBefore.match(new RegExp(`(${pattern.source})$`))
      if (!match) {
        return null
      }
      const text = match[1] ?? match[0] ?? ''
      return { from: lineStart + lineBefore.length - text.length, to: pos, text }
    },
  } as never
}

describe('HA jinja completion catalog', () => {
  it('prioritizes homeassistant functions over generic jinja', () => {
    const labels = HA_EXPRESSION_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toContain('states')
    expect(labels).toContain('now')
    expect(labels).not.toContain('sameas')
    expect(labels).not.toContain('string')
  })

  it('offers state_attr and is_state_attr helpers', () => {
    const labels = HA_EXPRESSION_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toEqual(expect.arrayContaining(['state_attr', 'is_state_attr']))
    const isStateAttr = HA_EXPRESSION_COMPLETIONS.find((entry) => entry.label === 'is_state_attr')
    expect(isStateAttr?.detail).toContain('value')
  })

  it('includes now() strftime as the supported method', () => {
    const labels = HA_NOW_METHOD_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toEqual(['strftime'])
    expect(HA_NOW_METHOD_COMPLETIONS[0]?.detail).toContain('%H:%M')
  })

  it('includes homeassistant filters', () => {
    const labels = HA_FILTER_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toEqual(expect.arrayContaining(['float', 'int', 'round']))
  })

  it('includes statement tags used in drawcustom template strings', () => {
    const labels = HA_TAG_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toEqual(
      expect.arrayContaining(['set', 'if', 'elif', 'else', 'endif', 'for', 'endfor']),
    )
  })

  it('offers jinja delimiters after a lone open brace', () => {
    const labels = HA_DELIMITER_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toEqual(['{{', '{%'])
  })
})

describe('resolveJinjaCompletionContext', () => {
  it('offers delimiters after a lone { in a yaml value', () => {
    const doc = '  y_start: 50 {'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'delimiter',
      from: pos,
      prefix: '',
    })
  })

  it('returns null after a plain quoted yaml value', () => {
    const doc = '  color: "red"'
    expect(resolveJinjaCompletionContext(mockContext(doc, doc.length))).toBeNull()
  })

  it('offers tag keywords right after opening {%', () => {
    const doc = '  size: 32 {%'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'tag',
      from: pos,
      prefix: '',
    })
  })

  it('matches partial tag keywords inside {%', () => {
    const doc = '  size: 32 {% se'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'tag',
      from: doc.indexOf('se'),
      prefix: 'se',
    })
  })

  it('still resolves expression helpers inside {{', () => {
    const doc = '  value: "{{ stat'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'expression',
      from: doc.indexOf('stat'),
      prefix: 'stat',
    })
  })

  it('offers entity-id completions inside is_state_attr() first argument', () => {
    const doc = "  value: \"{{ is_state_attr('cal"
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'entity-id',
      from: doc.indexOf('cal'),
      prefix: 'cal',
    })
  })

  it('resolves now() method completions after the dot', () => {
    const doc = '  value: "{{ now().str'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'now-method',
      from: doc.indexOf('str'),
      prefix: 'str',
    })
  })

  it('offers now() methods right after now().', () => {
    const doc = '  value: "{{ now().'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'now-method',
      from: pos,
      prefix: '',
    })
  })

  it('offers strftime format codes after % inside strftime quotes', () => {
    const doc = '  x_end: |-\n    {{ now().strftime(\'%'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'strftime-format',
      from: pos - 1,
      prefix: '',
    })
  })

  it('offers strftime format codes after a second consecutive %', () => {
    const doc = '  value: "{{ now().strftime(\'%H%M%'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'strftime-format',
      from: pos - 1,
      prefix: '',
    })
  })

  it('filters strftime format codes while typing the current specifier', () => {
    const doc = '  value: "{{ now().strftime(\'%H%M'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'strftime-format',
      from: pos - 2,
      prefix: 'M',
    })
  })

  it('resolves expression helpers inside an iif() argument position', () => {
    const doc = '  value: "{{ iif('
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'expression',
      from: pos,
      prefix: '',
    })
  })

  it('resolves expression helpers after a comma inside iif()', () => {
    const doc = "  value: \"{{ iif(is_state('a.b', 'on'), "
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'expression',
      from: pos,
      prefix: '',
    })
  })

  it('still matches a typed prefix inside an iif() argument', () => {
    const doc = '  value: "{{ iif(stat'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'expression',
      from: doc.indexOf('stat'),
      prefix: 'stat',
    })
  })

  it('resolves tag keywords inside a scaffolded {% %} block', () => {
    const doc = '  size: 32 {% %}'
    const pos = doc.indexOf('{%') + 2
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'tag',
      from: pos,
      prefix: '',
    })
  })
})
