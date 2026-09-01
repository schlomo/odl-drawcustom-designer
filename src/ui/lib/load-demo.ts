export const LOAD_DEMO_CONFIRM_MESSAGE =
  'Replace the current design with the showcase demo? Unsaved changes will be lost.'

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
 * all (it is one of the two escape hatches out of one), so the prompt has to
 * account for it.
 */
export function shouldConfirmLoadDemo(elementCount: number, yamlBlocked = false): boolean {
  return elementCount > 0 || yamlBlocked
}

export function requestLoadDemoConfirm(): boolean {
  return window.confirm(LOAD_DEMO_CONFIRM_MESSAGE)
}
