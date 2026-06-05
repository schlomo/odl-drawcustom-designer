/** @vitest-environment jsdom */
import { CompletionContext } from '@codemirror/autocomplete'
import { forceLinting } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
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

  function mountEditor(doc: string) {
    container = document.body.appendChild(document.createElement('div'))
    const pointerActiveRef = { current: false }
    const onCursorPositionChangeRef = { current: undefined }
    const state = createYamlEditorState(
      doc,
      'dark',
      13,
      [],
      () => {},
      pointerActiveRef,
      onCursorPositionChangeRef,
      () => true,
    )
    view = new EditorView({ state, parent: container })
    return view
  }

  it('renders lint markers for the first list item', async () => {
    mountEditor(INVALID_FIRST_BLOCK)
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
    mountEditor(INVALID_FIRST_BLOCK)
    const headerPos = INVALID_FIRST_BLOCK.indexOf('type:') + 'type: '.length
    const state = view!.state
    const context = new CompletionContext(state, headerPos, true)
    const result = yamlSchemaCompletionSource(context)

    expect(result).not.toBeNull()
    expect(result!.options.length).toBeGreaterThan(0)
    expect(result!.from).toBe(headerPos)
  })

  it('offers property completions on the first list item body', () => {
    mountEditor(INVALID_FIRST_BLOCK)
    const pos = INVALID_FIRST_BLOCK.indexOf('x_end') + 2
    const context = new CompletionContext(view!.state, pos, true)
    const result = yamlSchemaCompletionSource(context)

    expect(result).not.toBeNull()
    expect(result!.options.some((option) => option.label === 'x_start')).toBe(true)
    expect(result!.from).toBeGreaterThan(0)
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
