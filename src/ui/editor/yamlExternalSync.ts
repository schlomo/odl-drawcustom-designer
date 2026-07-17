import type { SelectionSource } from '../hooks/useProjectState'

/** Whether canvas/property edits should defer pushing serialized YAML into the editor. */
export function shouldDeferYamlExternalSync(options: {
  propertyEditing: boolean
  canvasDragging: boolean
  couplingEnabled: boolean
}): boolean {
  return (
    options.propertyEditing || (!options.couplingEnabled && options.canvasDragging)
  )
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
