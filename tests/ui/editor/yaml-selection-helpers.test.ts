import { EditorState, Transaction } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { shouldShowActiveLineHighlight } from '../../../src/ui/editor/yamlActiveLine'
import {
  shouldMoveCursorOnLinkedScroll,
  shouldReportYamlCursorPosition,
  shouldReportYamlDocChange,
  shouldSyncYamlCursorToCanvas,
} from '../../../src/ui/editor/yamlEditorSelection'
import { shouldApplyExternalYamlSync } from '../../../src/ui/editor/yamlElementsSync'

describe('shouldShowActiveLineHighlight', () => {
  it('shows the caret line highlight only for a collapsed selection', () => {
    expect(shouldShowActiveLineHighlight({ empty: true })).toBe(true)
    expect(shouldShowActiveLineHighlight({ empty: false })).toBe(false)
  })
})

describe('shouldReportYamlCursorPosition', () => {
  it('reports cursor position only for collapsed selections', () => {
    expect(shouldReportYamlCursorPosition({ empty: true })).toBe(true)
    expect(shouldReportYamlCursorPosition({ empty: false })).toBe(false)
  })
})

describe('shouldReportYamlDocChange', () => {
  it('reports only user-initiated transactions', () => {
    const state = EditorState.create({ doc: 'hello' })
    const userTransaction = state.update({
      changes: { from: 5, insert: '!' },
      annotations: Transaction.userEvent.of('input.type'),
    })
    const programmaticTransaction = state.update({
      changes: { from: 5, insert: '?' },
    })

    expect(shouldReportYamlDocChange(true, [userTransaction])).toBe(true)
    expect(shouldReportYamlDocChange(true, [programmaticTransaction])).toBe(false)
    expect(shouldReportYamlDocChange(false, [userTransaction])).toBe(false)
  })
})

describe('shouldSyncYamlCursorToCanvas', () => {
  it('only syncs canvas selection when the yaml editor is focused', () => {
    expect(shouldSyncYamlCursorToCanvas(true)).toBe(true)
    expect(shouldSyncYamlCursorToCanvas(false)).toBe(false)
  })
})

describe('shouldMoveCursorOnLinkedScroll', () => {
  it('moves the cursor on linked scroll only when not range-selecting', () => {
    expect(shouldMoveCursorOnLinkedScroll({ empty: true })).toBe(true)
    expect(shouldMoveCursorOnLinkedScroll({ empty: false })).toBe(false)
  })
})

describe('shouldApplyExternalYamlSync', () => {
  it('skips sync when the yaml edit originated in the panel', () => {
    expect(shouldApplyExternalYamlSync(true)).toBe(false)
  })

  it('applies sync for external element changes', () => {
    expect(shouldApplyExternalYamlSync(false)).toBe(true)
  })
})
