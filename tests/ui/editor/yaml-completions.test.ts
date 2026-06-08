import { describe, expect, it } from 'vitest'
import { getElementTypeInsertion } from '../../../src/core'
import {
  completionEntriesForContext,
  completionsFromContext,
  formatElementTypeApplyText,
  inferCurrentElementType,
  resolveYamlCompletionContext,
} from '../../../src/ui/editor/yamlCompletions'

describe('inferCurrentElementType', () => {
  it('finds type for cursor inside a list item', () => {
    const doc = `- type: text
  value: Hi
  x: 0
- type: line
  x_start: 0
`
    const pos = doc.indexOf('x_start')
    expect(inferCurrentElementType(doc, pos)).toBe('line')
  })

  it('returns null before any type is declared', () => {
    const doc = `- value: oops
`
    expect(inferCurrentElementType(doc, doc.length)).toBeNull()
  })

  it('finds type for properties below an incomplete type line on the first item', () => {
    const doc = `- type:
  value: Hi
  x: 0
`
    const pos = doc.indexOf('value')
    expect(inferCurrentElementType(doc, pos)).toBeNull()

    const typedDoc = `- type: text
  value: Hi
  x: 0
`
    const typedPos = typedDoc.indexOf('value')
    expect(inferCurrentElementType(typedDoc, typedPos)).toBe('text')
  })

  it('finds type for the first list item property lines', () => {
    const doc = `- type: rectangle
  x_start: 10
  x_end: 180
- type: text
  value: Hi
`
    const pos = doc.indexOf('x_end')
    expect(inferCurrentElementType(doc, pos)).toBe('rectangle')
  })

  it('finds icon_sequence for cursors on nested icons list lines', () => {
    const doc = `- type: icon_sequence
  x: 0
  icons:
    - mdi:home
    - hom
`
    const pos = doc.indexOf('hom') + 2
    expect(inferCurrentElementType(doc, pos)).toBe('icon_sequence')
  })
})

describe('resolveYamlCompletionContext', () => {
  it('detects element type completion after type:', () => {
    expect(resolveYamlCompletionContext('  type: ', null)).toEqual({ kind: 'element-type' })
    expect(resolveYamlCompletionContext('- type: ', null)).toEqual({ kind: 'element-type' })
  })

  it('detects partial element type values', () => {
    expect(resolveYamlCompletionContext('- type: t', null)).toEqual({
      kind: 'element-type',
      prefix: 't',
    })
  })

  it('suggests list item keys when starting a new element', () => {
    expect(resolveYamlCompletionContext('- ', null)).toEqual({ kind: 'list-item-key' })
    expect(resolveYamlCompletionContext('- t', null)).toEqual({ kind: 'list-item-key', prefix: 't' })
  })

  it('detects property completion for current element', () => {
    expect(resolveYamlCompletionContext('  val', 'text')).toEqual({
      kind: 'property',
      elementType: 'text',
      prefix: 'val',
    })
  })

  it('detects property completion on the first list item header line at offset 0', () => {
    expect(resolveYamlCompletionContext('- type: text', null)).toEqual({
      kind: 'element-type',
      prefix: 'text',
    })
  })

  it('detects color enum completion', () => {
    expect(resolveYamlCompletionContext('  color: ', 'text')).toEqual({
      kind: 'enum',
      enumName: 'color',
    })
  })

  it('detects color enum completion inside quoted values', () => {
    expect(resolveYamlCompletionContext('  color: "r', 'text')).toEqual({
      kind: 'enum',
      enumName: 'color',
      prefix: 'r',
    })
  })

  it('detects direction enum on progress_bar', () => {
    expect(resolveYamlCompletionContext('  direction: ', 'progress_bar')).toEqual({
      kind: 'enum',
      enumName: 'direction',
    })
  })

  it('detects icon name completion on icon value', () => {
    expect(resolveYamlCompletionContext('  value: hom', 'icon')).toEqual({
      kind: 'icon-name',
      prefix: 'hom',
    })
    expect(resolveYamlCompletionContext('  value: ', 'icon')).toEqual({
      kind: 'icon-name',
    })
    expect(resolveYamlCompletionContext('  value: home group', 'icon')).toEqual({
      kind: 'icon-name',
      prefix: 'home group',
    })
  })

  it('detects icon name completion on icon_sequence icons list items', () => {
    const doc = `- type: icon_sequence
  x: 0
  y: 0
  icons:
    - hom
    - mdi:arr
  size: 24
`
    const firstIconPos = doc.indexOf('hom') + 2
    expect(resolveYamlCompletionContext('    - hom', 'icon_sequence', doc, firstIconPos)).toEqual({
      kind: 'icon-name',
      prefix: 'hom',
    })
  })
})

describe('completionEntriesForContext', () => {
  it('returns all draw types for element-type context', () => {
    const entries = completionEntriesForContext({ kind: 'element-type' })
    expect(entries.length).toBe(16)
    expect(entries.some((e) => e.label === 'text')).toBe(true)
  })

  it('filters draw types by prefix', () => {
    const entries = completionEntriesForContext({ kind: 'element-type', prefix: 't' })
    expect(entries.every((e) => e.label.startsWith('t'))).toBe(true)
    expect(entries.some((e) => e.label === 'text')).toBe(true)
  })

  it('fuzzy-matches draw types when the prefix is a near miss', () => {
    const entries = completionEntriesForContext({ kind: 'element-type', prefix: 'tek' })
    expect(entries.some((e) => e.label === 'text')).toBe(true)
  })

  it('returns type key for new list items', () => {
    const entries = completionEntriesForContext({ kind: 'list-item-key', prefix: 't' })
    expect(entries).toEqual([{ label: 'type', kind: 'property', detail: 'draw element type' }])
  })

  it('returns text properties for text element', () => {
    const entries = completionEntriesForContext({ kind: 'property', elementType: 'text' })
    expect(entries.some((e) => e.label === 'value')).toBe(true)
    expect(entries.some((e) => e.label === 'anchor')).toBe(true)
  })

  it('returns color aliases for color enum', () => {
    const entries = completionEntriesForContext({ kind: 'enum', enumName: 'color' })
    expect(entries.some((e) => e.label === 'red')).toBe(true)
    expect(entries.some((e) => e.label === 'black')).toBe(true)
  })

  it('returns MDI icon names for icon-name context', () => {
    const entries = completionEntriesForContext({ kind: 'icon-name', prefix: 'home' })
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.label.includes('home'))).toBe(true)
    expect(entries[0]?.detail).toBe('MDI icon')
  })

  it('returns multi-word icon-name matches', () => {
    const entries = completionEntriesForContext({ kind: 'icon-name', prefix: 'home group' })
    expect(entries.some((e) => e.label === 'home-group')).toBe(true)
  })

  it('returns no icon-name entries without a typed prefix', () => {
    expect(completionEntriesForContext({ kind: 'icon-name' })).toEqual([])
  })
})

describe('element type completion apply', () => {
  it('inserts required keys after type: with a space', () => {
    const text = formatElementTypeApplyText('circle', ' ')
    expect(text).toBe(getElementTypeInsertion('circle'))
    expect(text).toContain('radius:')
  })

  it('inserts only missing keys when converting an existing block', () => {
    const lineBlock = `- type: line
  x_start: 10
  x_end: 250
  y_start: 140
  y_end: 140
  width: 2
  fill: black`
    const text = formatElementTypeApplyText('rectangle', ' ', lineBlock)
    expect(text).toBe('rectangle')
    expect(text).not.toContain('x_start:')
  })

  it('adds a space when the colon has no following space', () => {
    const text = formatElementTypeApplyText('circle', ':')
    expect(text.startsWith(' circle')).toBe(true)
    expect(text).toContain('\n  x:')
  })

  it('attaches a multi-line apply handler for element-type context', () => {
    const [circle] = completionsFromContext({ kind: 'element-type' }).filter(
      (option) => option.label === 'circle',
    )
    expect(typeof circle?.apply).toBe('function')
  })
})
