import type { SelectionSource } from '../hooks/useProjectState'

/**
 * Whether canvas/property edits should defer pushing serialized YAML into the
 * editor.
 *
 * A canvas drag defers for the whole gesture, whatever the YAML coupling mode
 * (issue #124): each pointermove commits a new `elements` array, and echoing
 * it into the editor means re-serializing the payload and replacing the whole
 * CodeMirror document — a full lezer re-parse and re-highlight, ~500 DOM nodes
 * churned — per move. Measured headed on the production build with the demo
 * payload, that was ~7 ms of ~24 ms per move (unlinking the editor dropped the
 * drag to the ~17 ms single-rectangle floor). The gesture's end re-runs the
 * sync effect and lands the final geometry in one write.
 */
export function shouldDeferYamlExternalSync(options: {
  propertyEditing: boolean
  canvasDragging: boolean
}): boolean {
  return options.propertyEditing || options.canvasDragging
}

/**
 * Whether an external YAML sync (elements -> editor text) should carry an
 * intentional scroll-to-linked-element command.
 *
 * `canvasDragging` matters on its own, independent of `selectionSource`:
 * a canvas drag-session start toggles `canvasDragging` even when the dragged
 * element was already selected via YAML (so `selectionSource` stays `'yaml'`
 * and never flips to signal "this came from the canvas"). Without checking
 * `canvasDragging` too, that case would never scroll the YAML pane to the
 * element the user just grabbed on the canvas (issue #37).
 */
export function shouldScrollLinkedElementOnSync(options: {
  couplingEnabled: boolean
  canvasDragging: boolean
  selectionSource: SelectionSource
}): boolean {
  return options.couplingEnabled && (options.canvasDragging || options.selectionSource !== 'yaml')
}

/**
 * YAML text when applying an external (non-editor) elements → YAML sync.
 * Always use live `serialized` — a queued pending copy can lag one commit behind
 * property-panel blur (elements update and propertyEditing=false in the same batch).
 */
export function yamlTextForExternalSync(serialized: string): string {
  return serialized
}
