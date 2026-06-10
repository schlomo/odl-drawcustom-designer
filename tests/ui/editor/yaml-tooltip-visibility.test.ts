/** @vitest-environment jsdom */
import { EditorView } from '@codemirror/view'
import { describe, expect, it, afterEach } from 'vitest'
import { createYamlEditorState } from '../../../src/ui/editor/yamlEditorExtensions'

/**
 * CodeMirror hides tooltips when the anchor position sits inside the
 * scroll-margin inset. A global top margin made the first list item look
 * broken regardless of linked-selection mode.
 */
describe('yaml tooltip clipping', () => {
  let view: EditorView | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    view?.destroy()
    view = null
    container?.remove()
    container = null
  })

  it('does not install a global scroll margin that hides top-line tooltips', () => {
    const doc = `- type: tex
  value: Hi
- type: rectangle
  x_start: 10
`
    container = document.body.appendChild(document.createElement('div'))
    const pointerActiveRef = { current: false }
    const onCursorPositionChangeRef = { current: undefined }
    const suppressCursorReportRef = { current: false }
    view = new EditorView({
      state: createYamlEditorState(
        doc,
        'dark',
        13,
        [],
        () => {},
        pointerActiveRef,
        onCursorPositionChangeRef,
        suppressCursorReportRef,
      ),
      parent: container,
    })

    const margins = view.state
      .facet(EditorView.scrollMargins)
      .map((source) => source(view))
      .filter((value): value is { top?: number; bottom?: number } => value != null)

    const top = margins.reduce((max, margin) => Math.max(max, margin.top ?? 0), 0)
    expect(top).toBeLessThan(48)
  })
})
