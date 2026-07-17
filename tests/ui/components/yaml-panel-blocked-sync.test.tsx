/** @vitest-environment jsdom */
import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { YamlPanel } from '../../../src/ui/components/YamlPanel'

/**
 * Issue #35 — repro: while the live YAML document is broken (parse or
 * schema failure), `elements` freezes at its last-valid state, but the
 * external-sync effect in YamlPanel.tsx re-ran on *any* dependency change
 * (`canvasDragging`, `propertyEditing`, `couplingEnabled`, `serialized`) and
 * unconditionally rewrote the editor with the stale serialization — so a
 * canvas pointerdown or a property-field focus/blur silently discarded the
 * user's in-progress edit. This mounts the real `EditorView` (via
 * `YamlPanel` -> `YamlEditor`, see tests/ui/editor/yaml-editor-integration
 * for the direct-EditorView mounting pattern) so the assertion exercises the
 * actual CodeMirror document, not a jsdom/prop stand-in.
 */

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

const elements: DrawElement[] = [
  { type: 'text', value: 'A', x: 0, y: 0 },
  { type: 'text', value: 'B', x: 1, y: 1 },
]

function panelProps(overrides: Partial<React.ComponentProps<typeof YamlPanel>> = {}) {
  return {
    elements,
    sessionName: 'test-session',
    selectedIndex: null,
    selectionSource: 'canvas' as const,
    onSelectElement: () => {},
    onElementsChange: () => {},
    colorScheme: 'dark' as const,
    containerRef: { current: null },
    canvasDragging: false,
    propertyEditing: false,
    ...overrides,
  }
}

/**
 * Dispatch a document edit tagged as user input. `YamlEditor`'s update
 * listener (`shouldReportYamlDocChange`) only reports doc changes to React
 * when the transaction carries a `Transaction.userEvent` annotation — real
 * keystrokes get one automatically; programmatic replacements (e.g. the
 * external YAML <- elements sync) deliberately do not, so they don't loop
 * back through `onChange`. Tests simulating typing must tag it explicitly.
 */
function dispatchUserEdit(
  view: EditorView,
  changes: { from: number; to: number; insert: string },
): void {
  act(() => {
    view.dispatch({
      changes,
      annotations: Transaction.userEvent.of('input'),
    })
  })
}

function findMountedView(container: HTMLElement): EditorView {
  const editorRoot = container.querySelector('.cm-editor')
  if (!editorRoot) {
    throw new Error('CodeMirror .cm-editor root not found — did YamlEditor mount?')
  }
  const view = EditorView.findFromDOM(editorRoot as HTMLElement)
  if (!view) {
    throw new Error('EditorView.findFromDOM returned null')
  }
  return view
}

describe('YamlPanel external-sync while the live YAML doc is broken (issue #35)', () => {
  it('never rewrites the editor text on canvasDragging/propertyEditing toggles while broken', () => {
    const { container, rerender } = render(<YamlPanel {...panelProps()} />)
    const view = findMountedView(container)

    const validDoc = view.state.doc.toString()

    // Break the document via a real EditorView transaction — delete the
    // first `:`, the same repro shape as the Playwright spec.
    const colonIndex = validDoc.indexOf(':')
    expect(colonIndex).toBeGreaterThan(-1)
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })

    const brokenDoc = view.state.doc.toString()
    expect(brokenDoc).not.toBe(validDoc)

    // A canvas pointerdown toggles canvasDragging true (YAML<->canvas
    // coupling defaults on, so this alone used to trigger the external-sync
    // effect and revert the broken doc), then a pointerup toggles it back.
    rerender(<YamlPanel {...panelProps({ canvasDragging: true })} />)
    expect(view.state.doc.toString()).toBe(brokenDoc)

    rerender(<YamlPanel {...panelProps({ canvasDragging: false })} />)
    expect(view.state.doc.toString()).toBe(brokenDoc)

    // A property-panel field focus/blur toggles propertyEditing true, then
    // false — this is the exact path from issue #35 (blur commits+ends
    // editing in the same batch, re-running the sync effect).
    rerender(<YamlPanel {...panelProps({ propertyEditing: true })} />)
    expect(view.state.doc.toString()).toBe(brokenDoc)

    rerender(<YamlPanel {...panelProps({ propertyEditing: false })} />)
    expect(view.state.doc.toString()).toBe(brokenDoc)
  })

  it('reports the blocked state to the parent while the doc is broken, and clears it once fixed', () => {
    const blockedStates: boolean[] = []
    const { container, rerender } = render(
      <YamlPanel {...panelProps({ onYamlBlockedChange: (blocked) => blockedStates.push(blocked) })} />,
    )
    const view = findMountedView(container)
    expect(blockedStates.at(-1)).toBe(false)

    const validDoc = view.state.doc.toString()
    const colonIndex = validDoc.indexOf(':')
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })
    // Re-render so the effect bubbling the derived state has a chance to run
    // (mirrors React's own commit -> effect cycle for the real component).
    rerender(
      <YamlPanel {...panelProps({ onYamlBlockedChange: (blocked) => blockedStates.push(blocked) })} />,
    )
    expect(blockedStates.at(-1)).toBe(true)

    dispatchUserEdit(view, { from: colonIndex, to: colonIndex, insert: ':' })
    rerender(
      <YamlPanel {...panelProps({ onYamlBlockedChange: (blocked) => blockedStates.push(blocked) })} />,
    )
    expect(blockedStates.at(-1)).toBe(false)
  })
})
