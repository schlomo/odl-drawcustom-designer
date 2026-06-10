/** @vitest-environment jsdom */
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { createYamlEditorState } from '../../../src/ui/editor/yamlEditorExtensions'
import {
  blockScalarIndicatorRangeOnLine,
  classifyYamlScalar,
  keyRangeOnLine,
  scalarValueRangeOnLine,
} from '../../../src/ui/editor/yamlScalarHighlight'

describe('classifyYamlScalar', () => {
  it('classifies booleans, null, and numbers', () => {
    expect(classifyYamlScalar('true')).toBe('bool')
    expect(classifyYamlScalar('false')).toBe('bool')
    expect(classifyYamlScalar('null')).toBe('null')
    expect(classifyYamlScalar('~')).toBe('null')
    expect(classifyYamlScalar('0')).toBe('number')
    expect(classifyYamlScalar('42')).toBe('number')
    expect(classifyYamlScalar('-3.5')).toBe('number')
    expect(classifyYamlScalar('1e3')).toBe('number')
    expect(classifyYamlScalar('0x1A')).toBe('number')
  })

  it('leaves unquoted plain strings unclassified (default text color)', () => {
    expect(classifyYamlScalar('red')).toBeNull()
    expect(classifyYamlScalar('half_accent')).toBeNull()
    expect(classifyYamlScalar('text')).toBeNull()
    expect(classifyYamlScalar('{{ states("sensor.temp") }}')).toBeNull()
  })
})

describe('keyRangeOnLine', () => {
  it('finds property key spans', () => {
    expect(keyRangeOnLine('- type: debug_grid', 0)).toEqual({ from: 2, to: 6 })
    expect(keyRangeOnLine('  spacing: 80', 10)).toEqual({ from: 12, to: 19 })
  })
})

describe('blockScalarIndicatorRangeOnLine', () => {
  it('finds | and > block scalar indicators', () => {
    expect(blockScalarIndicatorRangeOnLine('  value: |-', 0)).toEqual({ from: 9, to: 11 })
    expect(blockScalarIndicatorRangeOnLine('  body: >-', 0)).toEqual({ from: 8, to: 10 })
    expect(blockScalarIndicatorRangeOnLine('  value: |2', 0)).toEqual({ from: 9, to: 11 })
  })
})

describe('scalarValueRangeOnLine', () => {
  it('finds numeric and boolean value ranges', () => {
    expect(scalarValueRangeOnLine('- type: text', 0)).toBeNull()
    expect(scalarValueRangeOnLine('  visible: true', 0)).toMatchObject({
      from: 11,
      to: 15,
      kind: 'bool',
    })
    expect(scalarValueRangeOnLine('  x: 10', 0)).toMatchObject({
      from: 5,
      to: 7,
      kind: 'number',
    })
    expect(scalarValueRangeOnLine('  value: "Hello"', 0)).toBeNull()
    expect(scalarValueRangeOnLine('  points:', 0)).toBeNull()
  })
})

describe('yamlScalarHighlight integration', () => {
  let container: HTMLDivElement | null = null
  let view: EditorView | null = null

  afterEach(() => {
    view?.destroy()
    view = null
    container?.remove()
    container = null
  })

  function mountEditor(yaml: string, colorScheme: 'light' | 'dark' = 'dark') {
    container = document.createElement('div')
    document.body.appendChild(container)
    view = new EditorView({
      state: createYamlEditorState(
        yaml,
        colorScheme,
        13,
        () => {},
        () => {},
        undefined,
        undefined,
        [],
      ),
      parent: container,
    })
    return container
  }

  it('applies classical classes to keys, bool, and numbers', () => {
    const root = mountEditor(`- type: text
  value: "Hello"
  visible: true
  x: 10
  color: red
`)
    const html = root.innerHTML
    expect(html).toContain('cm-yamlKey')
    expect(html).not.toContain('cm-yamlQuotedString')
    expect(html).toContain('cm-yamlScalarBool')
    expect(html).toContain('cm-yamlScalarNumber')
    expect(html).not.toContain('cm-yamlScalarString')
  })

  it('highlights block scalar header indicators', () => {
    const root = mountEditor(`- type: text
  value: |-
    line one
    line two
`)
    expect(root.innerHTML).toContain('cm-yamlBlockIndicator')
  })

  it('does not flatten Jinja syntax inside quoted template values', () => {
    const root = mountEditor(`- type: text
  value: "{{ now().strftime('%H:%M') }}"
`)
    expect(root.innerHTML).not.toContain('cm-yamlQuotedString')
    const templateLine = [...root.querySelectorAll('.cm-line')].find((line) =>
      line.textContent?.includes('now'),
    )
    expect(templateLine).toBeDefined()
    const spanClasses = new Set(
      [...templateLine!.querySelectorAll('span')].map((span) => span.className),
    )
    expect(spanClasses.size).toBeGreaterThan(1)
  })

  it('does not tag mapping keys or plain string values', () => {
    const root = mountEditor(`- type: text
  value: true
`)
    expect(root.querySelectorAll('.cm-yamlScalarBool')).toHaveLength(1)
    expect(root.querySelectorAll('.cm-yamlScalarString')).toHaveLength(0)
  })
})
