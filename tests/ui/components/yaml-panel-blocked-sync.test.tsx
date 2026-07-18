/** @vitest-environment jsdom */
import { CompletionContext } from '@codemirror/autocomplete'
import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { YamlPanel } from '../../../src/ui/components/YamlPanel'
import { haJinjaCompletionSource } from '../../../src/ui/editor/jinjaCompletions'
import { yamlSchemaCompletionSource } from '../../../src/ui/editor/yamlCompletionSource'

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

// jsdom has no layout engine, so `Range.getClientRects` is unimplemented.
// CodeMirror's `scrollIntoView: true` dispatch effect (used by the Jinja
// completion `apply` functions under test below) measures the document via
// this API — stub it so mounting a real `EditorView` and accepting one of
// those completions doesn't throw.
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

describe('YamlPanel autocomplete accept reaches React state (issue #35 follow-up, bug A)', () => {
  it('unblocks and syncs elements after accepting a type completion', () => {
    vi.useFakeTimers()
    const blockedStates: boolean[] = []
    const elementsChanges: DrawElement[][] = []
    const { container } = render(
      <YamlPanel
        {...panelProps({
          onYamlBlockedChange: (blocked) => blockedStates.push(blocked),
          onElementsChange: (next) => elementsChanges.push(next),
        })}
      />,
    )
    const view = findMountedView(container)

    // Start a new list item by hand: `- type: t` — invalid (not a known
    // type), so the doc blocks.
    const doc = view.state.doc.toString()
    const insertPos = doc.length
    const typed = `${doc.endsWith('\n') ? '' : '\n'}- type: t`
    dispatchUserEdit(view, { from: insertPos, to: insertPos, insert: typed })
    expect(blockedStates.at(-1)).toBe(true)

    // Accept the `text` completion exactly the way the editor does: through
    // the schema completion source's own apply function (which inserts the
    // type name plus its required properties).
    const cursor = insertPos + typed.length
    const completionResult = yamlSchemaCompletionSource(
      new CompletionContext(view.state, cursor, true),
    )
    expect(completionResult).not.toBeNull()
    const textOption = completionResult!.options.find((option) => option.label === 'text')
    expect(textOption).toBeDefined()
    expect(typeof textOption!.apply).toBe('function')
    act(() => {
      ;(textOption!.apply as (view: EditorView, completion: unknown, from: number, to: number) => void)(
        view,
        textOption!,
        completionResult!.from,
        cursor,
      )
    })

    // The completion produced a valid document — the blocked state must
    // clear (the maintainer repro: it stayed locked because the completion's
    // transaction never reached handleYamlChange)...
    expect(view.state.doc.toString()).toContain('value: Hello World!')
    expect(blockedStates.at(-1)).toBe(false)

    // ...and the new element must reach the canvas after the sync debounce.
    act(() => {
      vi.advanceTimersByTime(80)
    })
    const lastElements = elementsChanges.at(-1)
    expect(lastElements).toBeDefined()
    expect(lastElements).toHaveLength(3)
    expect(lastElements![2]).toMatchObject({ type: 'text', value: 'Hello World!' })
  })
})

describe('YamlPanel never echoes stale YAML over newer editor text (issue #35 follow-up, bug B)', () => {
  it('typing through a transient invalid state keeps the typed text (y: 0 -> 30, not 00)', () => {
    vi.useFakeTimers()
    const elementsChanges: DrawElement[][] = []
    const { container } = render(
      <YamlPanel
        {...panelProps({
          elements: [{ type: 'text', value: 'A', x: 0, y: 0 }],
          onElementsChange: (next) => elementsChanges.push(next),
        })}
      />,
    )
    const view = findMountedView(container)

    // `y: 0` -> erase the `0` (doc momentarily invalid: y becomes null)...
    const zeroPos = view.state.doc.toString().indexOf('y: 0') + 'y: '.length
    expect(zeroPos).toBeGreaterThan('y: '.length - 1)
    dispatchUserEdit(view, { from: zeroPos, to: zeroPos + 1, insert: '' })

    // ...then type `3` (doc valid again, debounce pending). The maintainer
    // regression: the blocked->unblocked flip re-ran the external-sync
    // effect, which echoed the STALE serialization (y: 0) over the editor.
    dispatchUserEdit(view, { from: zeroPos, to: zeroPos, insert: '3' })
    expect(view.state.doc.toString()).toContain('y: 3')

    // ...then type `0` — the doc must show the user's `30`, never `00`.
    dispatchUserEdit(view, { from: zeroPos + 1, to: zeroPos + 1, insert: '0' })
    expect(view.state.doc.toString()).toContain('y: 30')
    expect(view.state.doc.toString()).not.toContain('y: 00')

    // The debounced sync commits the typed value.
    act(() => {
      vi.advanceTimersByTime(80)
    })
    expect(elementsChanges.at(-1)?.[0]).toMatchObject({ y: 30 })
  })

  it('edits made while broken survive repairing the document (delete colon -> edit -> restore)', () => {
    // Exact repro from the PR #42 review: delete the `type` colon, change
    // ANOTHER value while the doc is broken, then restore the colon. The
    // blocked->unblocked flip must not echo the stale serialization over
    // either edit.
    vi.useFakeTimers()
    const elementsChanges: DrawElement[][] = []
    const { container } = render(
      <YamlPanel
        {...panelProps({
          elements: [{ type: 'text', value: 'A', x: 0, y: 0 }],
          onElementsChange: (next) => elementsChanges.push(next),
        })}
      />,
    )
    const view = findMountedView(container)

    const colonIndex = view.state.doc.toString().indexOf(':')
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })

    // While broken: change `value: A` to `value: AZ`.
    const valuePos = view.state.doc.toString().indexOf('value: A') + 'value: A'.length
    dispatchUserEdit(view, { from: valuePos, to: valuePos, insert: 'Z' })

    // Repair the colon — doc valid again; the mid-broken edit must survive.
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex, insert: ':' })
    expect(view.state.doc.toString()).toContain('value: AZ')

    act(() => {
      vi.advanceTimersByTime(80)
    })
    expect(elementsChanges.at(-1)?.[0]).toMatchObject({ value: 'AZ' })
    expect(view.state.doc.toString()).toContain('value: AZ')
  })

  it('a canvas-drag toggle during the sync debounce does not rewrite newer editor text', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(
      <YamlPanel {...panelProps({ elements: [{ type: 'text', value: 'A', x: 0, y: 0 }] })} />,
    )
    const view = findMountedView(container)

    // Valid -> valid edit: `y: 0` -> `y: 9`; the 80ms sync debounce is
    // still pending, so `elements` (and `serialized`) lag the editor.
    const zeroPos = view.state.doc.toString().indexOf('y: 0') + 'y: '.length
    dispatchUserEdit(view, { from: zeroPos, to: zeroPos + 1, insert: '9' })
    expect(view.state.doc.toString()).toContain('y: 9')

    // A canvas pointerdown toggles canvasDragging inside that window — it
    // must not clobber the newer editor text with the stale serialization.
    rerender(
      <YamlPanel
        {...panelProps({ elements: [{ type: 'text', value: 'A', x: 0, y: 0 }], canvasDragging: true })}
      />,
    )
    expect(view.state.doc.toString()).toContain('y: 9')
  })
})

/**
 * PR #42 fixed this exact bug for the element-type completion
 * (`yamlCompletions.ts`): its `apply` dispatched without a `userEvent`
 * annotation, so `shouldReportYamlDocChange` — which only reports annotated
 * transactions to React — silently dropped the change. The identical bug
 * exists in `jinjaCompletions.ts`'s `applyJinjaSnippet` (used by the `{%
 * tag %}` completions) and `applyExpression` (used by the `states`,
 * `is_state`, etc. helpers): both dispatch unannotated, so accepting a
 * Jinja completion leaves `elements` — and everything derived from it,
 * including the lint banner and the #35 blocked state — frozen until a
 * later real keystroke re-syncs the (by then already-combined) text.
 */
describe('YamlPanel Jinja completions reach React state (issue #35 follow-up, jinjaCompletions.ts)', () => {
  it('applyExpression (states helper) syncs to elements', () => {
    vi.useFakeTimers()
    const elementsChanges: DrawElement[][] = []
    const { container } = render(
      <YamlPanel
        {...panelProps({
          elements: [{ type: 'text', value: 'A', x: 0, y: 0 }],
          onElementsChange: (next) => elementsChanges.push(next),
        })}
      />,
    )
    const view = findMountedView(container)

    // Seed a partial Jinja expression inside the `value` field, exactly as
    // typing it would leave the doc: `value: "{{ s"`.
    const doc = view.state.doc.toString()
    const valueFrom = doc.indexOf('value: A')
    expect(valueFrom).toBeGreaterThan(-1)
    dispatchUserEdit(view, { from: valueFrom, to: valueFrom + 'value: A'.length, insert: 'value: "{{ s"' })
    act(() => {
      vi.advanceTimersByTime(80)
    })
    const baseline = elementsChanges.length
    expect(elementsChanges.at(-1)?.[0]).toMatchObject({ value: '{{ s' })

    // Accept the `states` expression completion exactly the way the editor
    // does: through the real Jinja completion source's own apply function.
    const cursor = view.state.doc.toString().indexOf('{{ s') + '{{ s'.length
    const completionResult = haJinjaCompletionSource([])(new CompletionContext(view.state, cursor, true))
    expect(completionResult).not.toBeNull()
    const statesOption = completionResult!.options.find((option) => option.label === 'states')
    expect(statesOption).toBeDefined()
    expect(typeof statesOption!.apply).toBe('function')

    act(() => {
      ;(statesOption!.apply as (view: EditorView, completion: unknown, from: number, to: number) => void)(
        view,
        statesOption!,
        completionResult!.from,
        cursor,
      )
    })
    expect(view.state.doc.toString()).toContain("states('')")

    act(() => {
      vi.advanceTimersByTime(80)
    })

    // Bug: without `userEvent` on the completion's dispatch, the update
    // listener's `shouldReportYamlDocChange` check ignores the transaction,
    // so `onElementsChange` never fires for this edit.
    expect(elementsChanges.length).toBeGreaterThan(baseline)
    expect(elementsChanges.at(-1)?.[0]).toMatchObject({ value: expect.stringContaining("states('')") })
  })

  it('applyJinjaSnippet (tag completion) syncs to elements', () => {
    vi.useFakeTimers()
    const elementsChanges: DrawElement[][] = []
    const { container } = render(
      <YamlPanel
        {...panelProps({
          elements: [{ type: 'text', value: 'A', x: 0, y: 0 }],
          onElementsChange: (next) => elementsChanges.push(next),
        })}
      />,
    )
    const view = findMountedView(container)

    // Seed a partial Jinja statement tag inside the `value` field:
    // `value: "{% i"`.
    const doc = view.state.doc.toString()
    const valueFrom = doc.indexOf('value: A')
    expect(valueFrom).toBeGreaterThan(-1)
    dispatchUserEdit(view, { from: valueFrom, to: valueFrom + 'value: A'.length, insert: 'value: "{% i"' })
    act(() => {
      vi.advanceTimersByTime(80)
    })
    const baseline = elementsChanges.length
    expect(elementsChanges.at(-1)?.[0]).toMatchObject({ value: '{% i' })

    // Accept the `if` tag completion exactly the way the editor does:
    // through the real Jinja completion source's own apply function.
    const cursor = view.state.doc.toString().indexOf('{% i') + '{% i'.length
    const completionResult = haJinjaCompletionSource([])(new CompletionContext(view.state, cursor, true))
    expect(completionResult).not.toBeNull()
    const ifOption = completionResult!.options.find((option) => option.label === 'if')
    expect(ifOption).toBeDefined()
    expect(typeof ifOption!.apply).toBe('function')

    act(() => {
      ;(ifOption!.apply as (view: EditorView, completion: unknown, from: number, to: number) => void)(
        view,
        ifOption!,
        completionResult!.from,
        cursor,
      )
    })
    expect(view.state.doc.toString()).toContain('if condition')

    act(() => {
      vi.advanceTimersByTime(80)
    })

    // Bug: without `userEvent` on the completion's dispatch, the update
    // listener's `shouldReportYamlDocChange` check ignores the transaction,
    // so `onElementsChange` never fires for this edit.
    expect(elementsChanges.length).toBeGreaterThan(baseline)
    expect(elementsChanges.at(-1)?.[0]).toMatchObject({ value: expect.stringContaining('if condition') })
  })
})
