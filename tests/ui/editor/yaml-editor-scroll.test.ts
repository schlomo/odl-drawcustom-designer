/** @vitest-environment jsdom */
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import {
  dispatchPreservingEditorViewState,
  mapPositionAcrossYamlResync,
} from '../../../src/ui/editor/yamlEditorScroll'

describe('mapPositionAcrossYamlResync', () => {
  const initial = `- type: text
  value: One
  x: 0
  y: 0
- type: text
  value: Two
  x: 10
  y: 10
`

  it('keeps cursor on the same element block when an earlier block changes size', () => {
    const cursor = initial.indexOf('value: Two')
    const updated = initial.replace('x: 0', 'x: 100')

    const mapped = mapPositionAcrossYamlResync(initial, updated, cursor)
    expect(updated.slice(mapped, mapped + 'value: Two'.length)).toBe('value: Two')
  })
})

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

  // Issue #37: a canvas click on a flow-style element starts a drag session,
  // which re-serializes the doc to block style and pushes it through this
  // dispatch with a pending `scrollLinkedElementIntoView` effect for the
  // freshly selected element. The old unconditional restore forced the
  // scroller back to its pre-click scrollTop immediately (and again next
  // rAF), clobbering that effect. `skipScrollRestore` lets the caller declare
  // "an intentional scroll is already pending" so the restore does not fire.
  it('does not restore the stale scrollTop when an intentional linked scroll is pending', () => {
    const initial = `- type: text
  value: One
  x: 0
  y: 0
- type: text
  value: Two
  x: 10
  y: 10
`
    mountEditor(initial, 0)

    // Simulate the pane having been scrolled to the top before the click
    // (the stale value a scroll-restore would otherwise reapply)...
    const staleScrollTop = 500
    const scrollStore = { current: staleScrollTop }
    // ...and the scroll-into-view effect having already landed the scroller
    // at the freshly selected element's position.
    view!.scrollDOM.scrollTop = 42

    const updated = initial.replace('x: 10', 'x: 11')
    dispatchPreservingEditorViewState(
      view!,
      {
        changes: { from: 0, to: view!.state.doc.length, insert: updated },
        effects: EditorView.scrollIntoView(0),
      },
      undefined,
      scrollStore,
      { skipScrollRestore: true },
    )

    expect(view!.scrollDOM.scrollTop).toBe(42)
  })

  it('still restores scrollTop for plain external syncs with no pending scroll intent', () => {
    const initial = `- type: text
  value: One
  x: 0
  y: 0
- type: text
  value: Two
  x: 10
  y: 10
`
    mountEditor(initial, 0)

    const staleScrollTop = 500
    const scrollStore = { current: staleScrollTop }
    view!.scrollDOM.scrollTop = 42

    const updated = initial.replace('x: 10', 'x: 11')
    dispatchPreservingEditorViewState(
      view!,
      { changes: { from: 0, to: view!.state.doc.length, insert: updated } },
      undefined,
      scrollStore,
    )

    expect(view!.scrollDOM.scrollTop).toBe(staleScrollTop)
  })
})
