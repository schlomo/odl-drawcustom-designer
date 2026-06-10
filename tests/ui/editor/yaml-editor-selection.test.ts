import { describe, expect, it } from 'vitest'
import {
  shouldReportLinkedYamlCursor,
  shouldSyncYamlCursorToCanvas,
} from '../../../src/ui/editor/yamlEditorSelection'

describe('shouldSyncYamlCursorToCanvas', () => {
  it('allows coupling when the editor has focus', () => {
    expect(shouldSyncYamlCursorToCanvas(true)).toBe(true)
  })

  it('allows coupling during an active pointer press before focus moves', () => {
    expect(shouldSyncYamlCursorToCanvas(false, true)).toBe(true)
  })

  it('blocks coupling when the editor is unfocused and no pointer is down', () => {
    expect(shouldSyncYamlCursorToCanvas(false, false)).toBe(false)
  })
})

describe('shouldReportLinkedYamlCursor', () => {
  it('reports collapsed pointer clicks before the editor receives focus', () => {
    expect(
      shouldReportLinkedYamlCursor({
        selectionSet: true,
        docChanged: false,
        viewHasFocus: false,
        pointerActive: true,
        selectionEmpty: true,
        userInitiated: false,
      }),
    ).toBe(true)
  })

  it('reports focused clicks annotated as user selection', () => {
    expect(
      shouldReportLinkedYamlCursor({
        selectionSet: true,
        docChanged: false,
        viewHasFocus: true,
        pointerActive: false,
        selectionEmpty: true,
        userInitiated: true,
      }),
    ).toBe(true)
  })

  it('reports typing updates when the editor is focused', () => {
    expect(
      shouldReportLinkedYamlCursor({
        selectionSet: true,
        docChanged: true,
        viewHasFocus: true,
        pointerActive: false,
        selectionEmpty: true,
        userInitiated: true,
      }),
    ).toBe(true)
  })

  it('ignores programmatic linked scroll selection while unfocused', () => {
    expect(
      shouldReportLinkedYamlCursor({
        selectionSet: true,
        docChanged: false,
        viewHasFocus: false,
        pointerActive: false,
        selectionEmpty: true,
        userInitiated: false,
      }),
    ).toBe(false)
  })

  it('ignores programmatic doc sync without a selection change', () => {
    expect(
      shouldReportLinkedYamlCursor({
        selectionSet: false,
        docChanged: true,
        viewHasFocus: true,
        pointerActive: false,
        selectionEmpty: true,
        userInitiated: false,
      }),
    ).toBe(false)
  })

  it('ignores non-collapsed selections while dragging', () => {
    expect(
      shouldReportLinkedYamlCursor({
        selectionSet: true,
        docChanged: false,
        viewHasFocus: true,
        pointerActive: true,
        selectionEmpty: false,
        userInitiated: true,
      }),
    ).toBe(false)
  })
})
