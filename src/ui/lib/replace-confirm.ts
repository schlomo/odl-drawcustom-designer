/**
 * Confirmation for the controls that REPLACE the design rather than edit it —
 * Load Demo, Clear all, and (while the document is broken) Undo.
 *
 * One implementation, three callers. The prompts differ only in wording:
 * `requestReplaceConfirm` is the single place that actually asks, so a caller
 * cannot accidentally grow a second, subtly different dialog behaviour.
 *
 * Why these three and not every mutating control: each one throws away work
 * the user cannot get back — and, once the escape hatches were allowed to run
 * on an unparseable document (maintainer ruling 2026-09-01), each can throw
 * away editor text that was never committed to `elements` at all, so nothing
 * downstream would even record that it existed.
 */

export const LOAD_DEMO_CONFIRM_MESSAGE =
  'Replace the current design with the showcase demo? Unsaved changes will be lost.'

/**
 * Clear all only asks while the document is broken. On a valid document it
 * keeps the behaviour it has always had (no prompt) — the maintainer asked for
 * the prompt specifically for the invalid case, where the thing being
 * destroyed is uncommitted text rather than a design the canvas is showing.
 */
export const CLEAR_ALL_INVALID_CONFIRM_MESSAGE =
  'Clear the design? The invalid YAML will be discarded and unsaved changes will be lost.'

/**
 * Undo while broken is not a keystroke-level undo and must not read as one:
 * the app's history holds element-model states, and text that never validated
 * never entered it. So the prompt says what actually happens — return to the
 * last valid design — and names CodeMirror's own undo as the finer-grained
 * alternative, which is still available and untouched.
 */
export const UNDO_INVALID_CONFIRM_MESSAGE =
  'Return to the last valid design? The invalid YAML will be discarded and unsaved changes will be lost. ' +
  "To step back through your text instead, cancel and use the editor's own undo (Ctrl/Cmd+Z)."

/**
 * Whether Load Demo should ask first — i.e. whether the user has anything to
 * lose.
 *
 * `yamlBlocked` is part of that question, not a detail: while the live
 * document fails to parse, `elements` is frozen at its last valid state, so
 * the element count alone describes the design the user has *committed*, not
 * the text in front of them. Someone hand-typing a design into an empty
 * document has `elementCount === 0` and everything to lose. That case only
 * became reachable once Load Demo was allowed to run on a broken document at
 * all (it is one of the escape hatches out of one), so the prompt has to
 * account for it.
 */
export function shouldConfirmLoadDemo(elementCount: number, yamlBlocked = false): boolean {
  return elementCount > 0 || yamlBlocked
}

/** The single confirmation prompt shared by every replacing control. */
export function requestReplaceConfirm(message: string): boolean {
  return window.confirm(message)
}
