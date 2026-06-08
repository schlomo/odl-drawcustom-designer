/** @vitest-environment jsdom */
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { dispatchPreservingEditorViewState } from '../../../src/ui/editor/yamlEditorScroll'

describe('dispatchPreservingEditorViewState', () => {
  let view: EditorView | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    view?.destroy()
    view = null
    container?.remove()
    container = null
  })

  function mountEditor(doc: string, cursor: number) {
    container = document.body.appendChild(document.createElement('div'))
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: cursor, head: cursor },
      }),
      parent: container,
    })
    return view
  }

  it('preserves cursor position across full-document external sync', () => {
    const initial = `- type: text
  value: One
  x: 0
  y: 0
- type: text
  value: Two
  x: 10
  y: 10
`
    const cursor = initial.indexOf('value: Two')
    mountEditor(initial, cursor)

    const updated = initial.replace('x: 10', 'x: 11')
    dispatchPreservingEditorViewState(view!, {
      changes: { from: 0, to: view!.state.doc.length, insert: updated },
    })

    expect(view!.state.doc.toString()).toBe(updated)
    expect(view!.state.selection.main.head).toBe(cursor)
  })

  it('maps cursor through edits to earlier blocks via stored selection ref', () => {
    const initial = `- type: text
  value: One
  x: 0
  y: 0
- type: text
  value: Two
  x: 10
  y: 10
`
    const cursor = initial.indexOf('value: Two')
    mountEditor(initial, cursor)
    const selectionStore = { current: { anchor: cursor, head: cursor } }

    const updated = initial.replace('x: 0', 'x: 100')
    dispatchPreservingEditorViewState(
      view!,
      { changes: { from: 0, to: view!.state.doc.length, insert: updated } },
      selectionStore,
    )

    const mappedCursor = updated.indexOf('value: Two')
    expect(view!.state.selection.main.head).toBe(mappedCursor)
    expect(
      view!.state.doc.sliceString(view!.state.selection.main.head, view!.state.selection.main.head + 10),
    ).toBe('value: Two')
  })
})
