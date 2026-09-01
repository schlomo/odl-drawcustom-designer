import type { DrawElement } from './elements'

type IconElement = Extract<DrawElement, { type: 'icon' }>

/** Merge legacy `color` into `fill` for icon elements (HA accepts both). */
export function normalizeIconElement(element: IconElement): IconElement {
  const record = element as Record<string, unknown>
  if (record.color === undefined) {
    return element
  }

  const next = { ...element } as Record<string, unknown>
  if (next.fill === undefined) {
    next.fill = record.color
  }
  delete next.color
  return next as IconElement
}

export function normalizeDrawElement(element: DrawElement): DrawElement {
  if (element.type === 'icon') {
    return normalizeIconElement(element)
  }
  return element
}

export function normalizePayload(elements: DrawElement[]): DrawElement[] {
  return elements.map(normalizeDrawElement)
}

/**
 * The element types HA's `imagegen` (and its `odl_renderer` fork) may position
 * from a running document-flow cursor: omit the vertical coordinate and the
 * renderer places the element at `ctx.pos_y + y_padding`, stacking it below
 * whatever came before. Mapped to the field each type actually uses.
 *
 * The designer has no such cursor — a deliberate non-goal — so it draws these
 * at 0 and the YAML, the canvas and the device disagree. On *import* the
 * coordinate is written out explicitly instead, and the shell says so (see
 * `docs/spec/odl-gap-report.md`). `diagram` is cursor-only and unimplemented,
 * so it has no entry here.
 */
const CURSOR_POSITIONED_FIELDS = {
  text: { vertical: 'y', after: 'x' },
  multiline: { vertical: 'y', after: 'x' },
  line: { vertical: 'y_start', after: 'x_start' },
} as const

export type CursorPositionedType = keyof typeof CURSOR_POSITIONED_FIELDS

/**
 * `spacing` is a `text` field upstream (`draw_text`, default 5).
 * `draw_multiline` never reads it — the designer invented that meaning, and
 * an import is where it gets undone: the key is dropped, which changes nothing
 * on screen and leaves the payload lint-clean. `text`, `debug_grid` and
 * `icon_sequence` all use `spacing` for real and are never touched.
 */
const SPACING_STRIP_TYPE = 'multiline'

/** What an import had to change, for the notice the user is shown. */
export interface ImportNormalization {
  /** How many elements gained an explicit vertical coordinate. */
  verticalCount: number
  /** Which element types gained one, de-duplicated and sorted. */
  verticalTypes: CursorPositionedType[]
  /** How many `multiline` elements had a dead `spacing` key dropped. */
  spacingCount: number
}

export interface ImportNormalizationResult {
  elements: DrawElement[]
  /** `null` when nothing changed — the caller shows no notice. */
  normalized: ImportNormalization | null
}

/**
 * Insert `key: value` immediately after `after`, keeping every existing key in
 * its original order — the payload must come back with nothing but the missing
 * coordinate added. Appends when `after` is absent.
 */
function withInsertedKey(
  source: Record<string, unknown>,
  after: string,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  let inserted = false
  for (const [existingKey, existingValue] of Object.entries(source)) {
    next[existingKey] = existingValue
    if (existingKey === after) {
      next[key] = value
      inserted = true
    }
  }
  if (!inserted) {
    next[key] = value
  }
  return next
}

/** Copy without `key`, leaving every other key in its original order. */
function withoutKey(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [existingKey, existingValue] of Object.entries(source)) {
    if (existingKey !== key) {
      next[existingKey] = existingValue
    }
  }
  return next
}

/**
 * Make an imported payload explicit: materialize the vertical coordinate of
 * every element that omitted it (at 0), and drop the `spacing` key
 * `multiline` never had a use for. Nothing else in the document is touched,
 * and running it over its own output is a no-op.
 *
 * Import-only, by design: the YAML editor's own parse path must never rewrite
 * the document the user is typing (ADR-009's echo contract), so this is called
 * at payload entry points — the share hash, and a host payload — not from
 * `validatePayload`/`serializeYamlPayload`.
 */
export function normalizeImportedPayload(
  elements: readonly DrawElement[],
): ImportNormalizationResult {
  const verticalTypes = new Set<CursorPositionedType>()
  let verticalCount = 0
  let spacingCount = 0

  const next = elements.map((element) => {
    let record = element as unknown as Record<string, unknown>
    let changed = false

    const fields = CURSOR_POSITIONED_FIELDS[element.type as CursorPositionedType] as
      | (typeof CURSOR_POSITIONED_FIELDS)[CursorPositionedType]
      | undefined
    if (fields && record[fields.vertical] === undefined) {
      verticalCount += 1
      verticalTypes.add(element.type as CursorPositionedType)
      record = withInsertedKey(record, fields.after, fields.vertical, 0)
      changed = true
    }

    if (element.type === SPACING_STRIP_TYPE && record.spacing !== undefined) {
      spacingCount += 1
      record = withoutKey(record, 'spacing')
      changed = true
    }

    return changed ? (record as unknown as DrawElement) : element
  })

  if (verticalCount === 0 && spacingCount === 0) {
    return { elements: elements as DrawElement[], normalized: null }
  }

  return {
    elements: next,
    normalized: { verticalCount, verticalTypes: [...verticalTypes].sort(), spacingCount },
  }
}
