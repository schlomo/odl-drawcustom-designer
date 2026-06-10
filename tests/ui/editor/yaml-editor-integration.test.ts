/** @vitest-environment jsdom */
import { CompletionContext } from '@codemirror/autocomplete'
import { indentWithTab } from '@codemirror/commands'
import { forceLinting } from '@codemirror/lint'
import { EditorState, Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it, afterEach, vi } from 'vitest'
import {
  completionInsertFrom,
  lineTextBeforeCursor,
  yamlSchemaCompletionSource,
} from '../../../src/ui/editor/yamlCompletionSource'
import {
  inferCurrentElementType,
  resolveYamlCompletionContext,
} from '../../../src/ui/editor/yamlCompletions'
import { createYamlEditorState } from '../../../src/ui/editor/yamlEditorExtensions'
import { locateElementIndexAtPosition } from '../../../src/ui/editor/locateElementInYaml'
import { lintYamlDocument } from '../../../src/ui/editor/yamlLint'

const INVALID_FIRST_BLOCK = `- type: rectangle
  x_tart: 10
  x_end: 180
- type: text
  value: Hi
`

describe('yaml editor first-block integration', () => {
  let view: EditorView | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    view?.destroy()
    view = null
    container?.remove()
    container = null
  })

  function mountEditor(
    doc: string,
    onChange: (value: string) => void = () => {},
    onCursorPositionChange: ((position: number, doc: string) => void) | undefined = undefined,
  ) {
    container = document.body.appendChild(document.createElement('div'))
    const pointerActiveRef = { current: false }
    const onCursorPositionChangeRef = { current: onCursorPositionChange }
    const suppressCursorReportRef = { current: false }
    const state = createYamlEditorState(
      doc,
      'dark',
      13,
      [],
      onChange,
      pointerActiveRef,
      onCursorPositionChangeRef,
      suppressCursorReportRef,
    )
    view = new EditorView({ state, parent: container })
    return { view, pointerActiveRef }
  }

  it('renders lint markers for the first list item', async () => {
    view = mountEditor(INVALID_FIRST_BLOCK).view
    forceLinting(view!)

    await vi.waitFor(() => {
      const lintNodes = view!.dom.querySelectorAll('.cm-lintRange-error')
      expect(lintNodes.length).toBeGreaterThan(0)
    })

    const diagnostics = lintYamlDocument(INVALID_FIRST_BLOCK)
    const firstItemDiagnostic = diagnostics.find((diagnostic) =>
      diagnostic.message.includes('x_tart'),
    )
    expect(firstItemDiagnostic).toBeDefined()
    expect(firstItemDiagnostic!.from).toBeGreaterThan(0)
    expect(INVALID_FIRST_BLOCK.slice(firstItemDiagnostic!.from, firstItemDiagnostic!.to)).toBe(
      'x_tart',
    )
  })

  it('offers schema completions on the first list item header line', () => {
    view = mountEditor(INVALID_FIRST_BLOCK).view
    const headerPos = INVALID_FIRST_BLOCK.indexOf('type:') + 'type: '.length
    const state = view!.state
    const context = new CompletionContext(state, headerPos, true)
    const result = yamlSchemaCompletionSource(context)

    expect(result).not.toBeNull()
    expect(result!.options.length).toBeGreaterThan(0)
    expect(result!.from).toBe(headerPos)
  })

  it('offers property completions on the first list item body', () => {
    view = mountEditor(INVALID_FIRST_BLOCK).view
    const pos = INVALID_FIRST_BLOCK.indexOf('x_end') + 2
    const context = new CompletionContext(view!.state, pos, true)
    const result = yamlSchemaCompletionSource(context)

    expect(result).not.toBeNull()
    expect(result!.options.some((option) => option.label === 'x_start')).toBe(true)
    expect(result!.from).toBeGreaterThan(0)
  })

  it('offers MDI icon matches for typed icon value prefixes', () => {
    const doc = `- type: icon
  x: 0
  y: 0
  value: home
  size: 24
`
    view = mountEditor(doc).view
    const pos = doc.indexOf('home') + 'home'.length
    const context = new CompletionContext(view!.state, pos, true)
    const result = yamlSchemaCompletionSource(context)

    expect(result).not.toBeNull()
    expect(result!.filter).toBe(false)
    expect(result!.options.length).toBeGreaterThan(10)
    expect(result!.options.every((option) => option.label.includes('home'))).toBe(true)
  })

  it('offers multi-word MDI icon matches in yaml value fields', () => {
    const doc = `- type: icon
  x: 0
  y: 0
  value: home group
  size: 24
`
    view = mountEditor(doc).view
    const pos = doc.indexOf('home group') + 'home group'.length
    const context = new CompletionContext(view!.state, pos, true)
    const result = yamlSchemaCompletionSource(context)

    expect(result).not.toBeNull()
    expect(result!.options.some((option) => option.label === 'home-group')).toBe(true)
  })

  it('does not offer icon names before any value text is typed', () => {
    const doc = `- type: icon
  x: 0
  y: 0
  value: 
  size: 24
`
    view = mountEditor(doc).view
    const pos = doc.indexOf('value: ') + 'value: '.length
    const context = new CompletionContext(view!.state, pos, true)
    expect(yamlSchemaCompletionSource(context)).toBeNull()
  })

  it('offers MDI icon matches on icon_sequence icons list lines', () => {
    const doc = `- type: icon_sequence
  x: 0
  y: 0
  icons:
    - mdi:home
    - home group
  size: 24
`
    view = mountEditor(doc).view
    const pos = doc.indexOf('home group') + 'home group'.length
    const context = new CompletionContext(view!.state, pos, true)
    const result = yamlSchemaCompletionSource(context)

    expect(result).not.toBeNull()
    expect(result!.options.some((option) => option.label === 'home-group')).toBe(true)
  })

  it('does not report programmatic document replacements', () => {
    const doc = `- type: text
  value: Hi
  color: '{{ states("sensor") }}'
`
    const onChange = vi.fn()
    view = mountEditor(doc, onChange).view
    const replacement = `- type: text
  value: Hi
  color: r
`
    onChange.mockClear()
    view!.dispatch({
      changes: { from: 0, to: view!.state.doc.length, insert: replacement },
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('offers boolean value completions for visible', () => {
    const doc = `- type: text
  value: Hi
  x: 0
  visible: 
`
    view = mountEditor(doc).view
    const pos = doc.indexOf('visible: ') + 'visible: '.length
    const context = new CompletionContext(view!.state, pos, true)
    const result = yamlSchemaCompletionSource(context)

    expect(result).not.toBeNull()
    expect(result!.options.map((option) => option.label)).toEqual(['true', 'false', 'True', 'False'])
  })

  it('indents the current line when Tab is pressed', () => {
    const doc = `- type: text
value: Hi
`
    view = mountEditor(doc).view
    const valueLineStart = doc.indexOf('value')
    view!.dispatch({ selection: { anchor: valueLineStart, head: valueLineStart } })
    view!.focus()

    expect(indentWithTab.run!(view!)).toBe(true)
    expect(view!.state.doc.line(2).text).toBe('  value: Hi')
  })

  it('reports user-initiated document edits', () => {
    const doc = `- type: text
  value: Hi
`
    const onChange = vi.fn()
    view = mountEditor(doc, onChange).view
    const colorPos = doc.indexOf('value: Hi') + 'value: Hi'.length
    onChange.mockClear()
    view!.dispatch({
      changes: { from: colorPos, insert: '!' },
      userEvent: 'input.type',
      annotations: Transaction.userEvent.of('input.type'),
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0]).toContain('Hi!')
  })

  it('reports linked cursor position with the live document while typing on the last block line', () => {
    const initial = `- type: rectangle
  x_start: 30
  x_end: 180
  outline: black
  width: 2
- type: circle
  x: 224
`
    let linkedPosition = 0
    let linkedDoc = initial
    const { view: mountedView } = mountEditor(initial, () => {}, (position, doc) => {
      linkedPosition = position
      linkedDoc = doc
    })
    view = mountedView

    const insertAt = initial.indexOf('width: 2') + 'width: 2'.length
    view!.focus()
    view!.dispatch({
      changes: { from: insertAt, to: insertAt, insert: '0' },
      selection: { anchor: insertAt + 1 },
      annotations: Transaction.userEvent.of('input.type'),
    })

    expect(locateElementIndexAtPosition(linkedDoc, linkedPosition)).toBe(0)
    expect(linkedDoc).toContain('width: 20')
  })

  it('reports linked selection when clicking another element block before focus', () => {
    const doc = `- type: rectangle
  x_start: 10
- type: circle
  x: 224
`
    let linkedIndex: number | null = null
    const { view: mountedView, pointerActiveRef } = mountEditor(doc, () => {}, (position, editorDoc) => {
      linkedIndex = locateElementIndexAtPosition(editorDoc, position)
    })
    view = mountedView

    const circlePos = doc.indexOf('x: 224')
    pointerActiveRef.current = true
    view.dispatch({ selection: { anchor: circlePos } })

    expect(linkedIndex).toBe(1)
  })
})

describe('yaml completion insert positions', () => {
  it('inserts element types after type: rather than at document offset 0', () => {
    const doc = `- type: text
  value: Hi
`
    const state = EditorState.create({ doc })
    const pos = 0
    const context = new CompletionContext(state, pos, true)
    const lineBefore = lineTextBeforeCursor(context)
    const completionContext = resolveYamlCompletionContext(
      lineBefore,
      inferCurrentElementType(doc, pos),
    )

    expect(completionContext).toEqual({ kind: 'element-type', prefix: 'text' })
    expect(completionInsertFrom(context, lineBefore, completionContext!)).toBe(
      doc.indexOf('text'),
    )
  })
})
