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
 * YAML text when applying an external (non-editor) elements → YAML sync.
 * Always use live `serialized` — a queued pending copy can lag one commit behind
 * property-panel blur (elements update and propertyEditing=false in the same batch).
 */
export function yamlTextForExternalSync(serialized: string): string {
  return serialized
}
