/** Mock Home Assistant entity state map for template preview. */
export interface HaMockContext {
  states: Record<string, string | number | boolean>
  /**
   * Per-entity attribute maps backing `state_attr(entity, attr)` and dotted
   * `states.<domain>.<object_id>.attributes.<attr>` access. Keyed by entity id.
   */
  attributes?: Record<string, Record<string, unknown>>
  /**
   * User-defined named variables exposed to EVERY field's template as bare
   * globals (`{{ name }}`). This is the designer's analog of Home Assistant
   * script-level `variables:` — the supported way to share a value across
   * fields, since `{% set %}` / `namespace()` state does not carry across
   * fields (per-field evaluation, ADR-004). Each value is a LITERAL mock value
   * (the resolved runtime value, consistent with mock states/attributes). It is
   * NOT rendered as a template, so a value containing `{{ … }}` is emitted
   * as-is. Stored as raw text; its native type is inferred at injection with
   * the same rule as mock attributes (`coerceAttributeValue`), because HA
   * renders `variables:` with `parse_result=True` and delivers typed (bool /
   * number / list / dict) values to downstream templates.
   */
  variables?: Record<string, string>
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
  /**
   * Attribute names referenced per entity via `state_attr('e','a')` or dotted
   * `states.<domain>.<object>.attributes.<attr>`, keyed by entity id. Sorted,
   * deduplicated. Surfaced in the State Simulator as pre-filled attribute rows.
   */
  attributesByEntity: Record<string, string[]>
  /**
   * Bare variable names referenced in templates (`{{ name }}` / used in
   * expressions) that are NOT HA globals, entity-id string args, or local
   * `{% set %}` names. Sorted, deduplicated. Surfaced in the State Simulator as
   * pre-filled, empty-valued variable rows the user just fills in (mirrors the
   * attribute pre-fill UX).
   */
  variablesReferenced: string[]
}
