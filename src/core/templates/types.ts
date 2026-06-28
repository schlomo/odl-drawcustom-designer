/** Mock Home Assistant entity state map for template preview. */
export interface HaMockContext {
  states: Record<string, string | number | boolean>
  /**
   * Per-entity attribute maps backing `state_attr(entity, attr)` and dotted
   * `states.<domain>.<object_id>.attributes.<attr>` access. Keyed by entity id.
   */
  attributes?: Record<string, Record<string, unknown>>
  /** Fixed clock for deterministic template preview (defaults to current local time). */
  now?: Date
}

export interface TemplateReference {
  /** JSON-path-like location within the payload, e.g. `[0].value`. */
  path: string
  /** Full string value containing template syntax. */
  raw: string
  /** Individual `{{ … }}` and `{% … %}` blocks found in `raw`. */
  expressions: string[]
}

export interface TemplateScanResult {
  references: TemplateReference[]
  /** Unique entity IDs referenced via HA template helpers, sorted. */
  entityIds: string[]
}
