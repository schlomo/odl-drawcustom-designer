import { describe, expect, it } from 'vitest'
import {
  CLEAR_ALL_INVALID_CONFIRM_MESSAGE,
  UNDO_INVALID_CONFIRM_MESSAGE,
  shouldConfirmLoadDemo,
} from '../../../src/ui/lib/replace-confirm'

describe('shouldConfirmLoadDemo', () => {
  it('does not confirm when the canvas is empty', () => {
    expect(shouldConfirmLoadDemo(0)).toBe(false)
  })

  it('confirms when any elements would be replaced', () => {
    expect(shouldConfirmLoadDemo(1)).toBe(true)
    expect(shouldConfirmLoadDemo(3)).toBe(true)
  })

  // While the document is broken `elements` is frozen at last-valid, so an
  // empty count does not mean an empty editor — the user may be part-way
  // through hand-typing a whole design. Load Demo can now run in that state
  // (it is an escape hatch out of it), so it must still ask first.
  it('confirms on a broken document even with no committed elements', () => {
    expect(shouldConfirmLoadDemo(0, true)).toBe(true)
  })

  it('still skips the prompt on an empty, valid document', () => {
    expect(shouldConfirmLoadDemo(0, false)).toBe(false)
  })
})

describe('invalid-document confirmation wording', () => {
  // The maintainer's point in asking for all three to confirm is consistency:
  // whichever control the user reaches for, the same fact is stated.
  it('tells the user the invalid YAML is what gets discarded', () => {
    expect(CLEAR_ALL_INVALID_CONFIRM_MESSAGE).toContain('invalid YAML')
    expect(UNDO_INVALID_CONFIRM_MESSAGE).toContain('invalid YAML')
  })

  /**
   * The one wording rule that is a correctness requirement rather than taste:
   * app-Undo is not a keystroke-level undo, and a user who expects one and
   * loses a paragraph would be right to be annoyed. The prompt has to say what
   * it really does and point at the editor's own undo for the other thing.
   */
  it('undo says it returns to the last valid design, and names the finer-grained alternative', () => {
    expect(UNDO_INVALID_CONFIRM_MESSAGE).toContain('Return to the last valid design')
    expect(UNDO_INVALID_CONFIRM_MESSAGE).toContain("editor's own undo")
    expect(UNDO_INVALID_CONFIRM_MESSAGE).toContain('Ctrl/Cmd+Z')
  })
})
