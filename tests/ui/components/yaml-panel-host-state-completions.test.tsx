/** @vitest-environment jsdom */
import { startCompletion, currentCompletions } from '@codemirror/autocomplete'
import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { YamlPanel } from '../../../src/ui/components/YamlPanel'

/**
 * The host's *whole* state catalog stays reachable in YAML autocomplete
 * (issue #107): the referenced-states panel lists only what the design reads,
 * so autocomplete is where a user finds a pushed key the payload does not
 * mention yet. This asserts it through the real chain — `YamlPanel` ->
 * `YamlEditor` -> the entity-ids compartment -> CodeMirror's own completion
 * pipeline — rather than through the `extraEntityIds` value the shell computes,
 * which cannot show that the keys ever reach a completion list.
 */

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const emptyClientRects = (): DOMRectList =>
  ({ length: 0, item: () => null, [Symbol.iterator]: () => [][Symbol.iterator]() }) as unknown as DOMRectList

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyClientRects
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => '' }) as DOMRect
  }
})

afterEach(() => {
  vi.useRealTimers()
})

const ELEMENTS: DrawElement[] = [
  { type: 'text', value: "{{ states('sensor.referenced') }}", x: 0, y: 0 },
]

/** A key the host pushed that this payload never reads. */
const PUSHED_UNREFERENCED = 'binary_sensor.pushed_door'

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

describe('YAML autocomplete offers the host catalog (issue #107)', () => {
  it('offers a pushed state the payload never references', async () => {
    const { container } = render(
      <YamlPanel
        elements={ELEMENTS}
        sessionName="test-session"
        selectedIndex={null}
        selectionSource="canvas"
        onSelectElement={() => {}}
        onElementsChange={() => {}}
        colorScheme="dark"
        containerRef={{ current: null }}
        extraEntityIds={['sensor.referenced', PUSHED_UNREFERENCED]}
      />,
    )
    const view = findMountedView(container)

    // Type an entity-id argument the way a user does, tagged as user input so
    // the editor treats it as a real keystroke (see yamlEditorSelection.ts).
    const doc = view.state.doc.toString()
    const typed = `${doc.endsWith('\n') ? '' : '\n'}- type: text\n  value: "{{ states('`
    const at = doc.length
    act(() => {
      view.dispatch({
        changes: { from: at, to: at, insert: typed },
        selection: { anchor: at + typed.length },
        annotations: Transaction.userEvent.of('input'),
      })
    })

    act(() => {
      startCompletion(view)
    })

    // CodeMirror resolves completion sources asynchronously.
    await vi.waitFor(() => {
      const labels = currentCompletions(view.state).map((completion) => completion.label)
      expect(labels).toContain(PUSHED_UNREFERENCED)
      expect(labels).toContain('sensor.referenced')
    })
  })
})
