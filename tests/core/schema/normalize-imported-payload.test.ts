import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../../src/core'
import {
  DRAW_ELEMENT_TYPES,
  normalizeImportedPayload,
  serializeYamlPayload,
  validatePayload,
} from '../../../src/core'
import { elementSchemasByType } from '../../../src/core/schema/elements'

/**
 * HA `imagegen` (and its `odl_renderer` fork) positions `text`, `multiline`
 * and `line` from a running document-flow cursor when their vertical
 * coordinate is omitted, and never reads `spacing` on a `multiline` at all.
 * The designer has no cursor (deliberate non-goal) and `spacing` on a
 * multiline is our own invention, so an *imported* payload gets the missing
 * coordinate written out as an explicit `0` and the dead key dropped — see
 * `docs/spec/odl-gap-report.md`.
 */
describe('normalizeImportedPayload', () => {
  const cursorPositioned: DrawElement[] = [
    { type: 'text', value: 'Cursor text', x: 10, font: 'ppb.ttf', anchor: 'lt' },
    {
      type: 'multiline',
      value: 'a\nb',
      delimiter: '\n',
      x: 10,
      offset_y: 12,
      font: 'ppb.ttf',
    },
    { type: 'line', x_start: 0, x_end: 100 },
  ] as unknown as DrawElement[]

  it('writes explicit zeros for every type that omits its vertical coordinate', () => {
    const result = normalizeImportedPayload(cursorPositioned)

    expect(result.elements).toEqual([
      { type: 'text', value: 'Cursor text', x: 10, y: 0, font: 'ppb.ttf', anchor: 'lt' },
      {
        type: 'multiline',
        value: 'a\nb',
        delimiter: '\n',
        x: 10,
        y: 0,
        offset_y: 12,
        font: 'ppb.ttf',
      },
      { type: 'line', x_start: 0, y_start: 0, x_end: 100 },
    ])
  })

  it('reports what it changed so the import can say so', () => {
    const result = normalizeImportedPayload(cursorPositioned)

    expect(result.normalized).toEqual({
      verticalCount: 3,
      verticalTypes: ['line', 'multiline', 'text'],
      spacingCount: 0,
    })
  })

  it('leaves an already-explicit payload untouched and reports nothing', () => {
    const explicit: DrawElement[] = [
      { type: 'text', value: 'Pinned', x: 10, y: 40, spacing: 5, font: 'ppb.ttf', anchor: 'lt' },
      { type: 'line', x_start: 0, y_start: 5, x_end: 100, y_end: 5 },
      { type: 'rectangle', x_start: 0, y_start: 0, x_end: 10, y_end: 10 },
    ] as unknown as DrawElement[]

    const result = normalizeImportedPayload(explicit)

    expect(result.elements).toEqual(explicit)
    expect(result.normalized).toBeNull()
  })

  it('is idempotent — normalizing its own output changes nothing and reports nothing', () => {
    const once = normalizeImportedPayload(cursorPositioned)
    const twice = normalizeImportedPayload(once.elements)

    expect(twice.elements).toEqual(once.elements)
    expect(twice.normalized).toBeNull()
  })

  it('keeps a templated vertical coordinate — only an absent one is materialized', () => {
    const templated = [
      { type: 'text', value: 'T', x: 1, y: '{{ 4 + 4 }}', font: 'ppb.ttf', anchor: 'lt' },
    ] as unknown as DrawElement[]

    const result = normalizeImportedPayload(templated)

    expect(result.elements).toEqual(templated)
    expect(result.normalized).toBeNull()
  })

  it('inserts the coordinate next to its horizontal partner rather than appending it', () => {
    const result = normalizeImportedPayload(cursorPositioned)

    expect(serializeYamlPayload(result.elements)).toContain(['  x: 10', '  y: 0'].join('\n'))
  })
})

/**
 * `spacing` is a `text` field upstream; `draw_multiline` never reads it (the
 * designer invented that meaning). Dropping it on import changes nothing on
 * screen — unlike the vertical coordinate, which can move an element.
 */
describe('normalizeImportedPayload — multiline spacing', () => {
  it('drops spacing from a multiline and keeps every other field in order', () => {
    const result = normalizeImportedPayload([
      {
        type: 'multiline',
        value: 'a\nb',
        delimiter: '\n',
        x: 10,
        y: 5,
        spacing: 4,
        offset_y: 12,
        font: 'ppb.ttf',
      },
    ] as unknown as DrawElement[])

    expect(result.elements).toEqual([
      {
        type: 'multiline',
        value: 'a\nb',
        delimiter: '\n',
        x: 10,
        y: 5,
        offset_y: 12,
        font: 'ppb.ttf',
      },
    ])
    expect(result.normalized).toEqual({
      verticalCount: 0,
      verticalTypes: [],
      spacingCount: 1,
    })
  })

  it('never touches spacing on the types that really have it', () => {
    // Pinned against the schema so a future sweep cannot eat the legitimate
    // ones: every type whose schema declares `spacing`. `multiline` is not
    // among them — #178 removed it — which is exactly why an imported payload
    // still carrying the key needs stripping rather than flagging.
    const withSpacing = DRAW_ELEMENT_TYPES.filter((type) => {
      const shape = (elementSchemasByType[type] as { shape?: Record<string, unknown> }).shape
      return shape != null && 'spacing' in shape
    })
    expect(withSpacing).toEqual(['debug_grid', 'text', 'icon_sequence'])

    const keepers = [
      { type: 'debug_grid', spacing: 20 },
      { type: 'text', value: 'T', x: 1, y: 1, spacing: 5, font: 'ppb.ttf', anchor: 'lt' },
      { type: 'icon_sequence', x: 1, y: 1, icons: 'mdi:home', spacing: 3 },
    ] as unknown as DrawElement[]

    const result = normalizeImportedPayload(keepers)

    expect(result.elements).toEqual(keepers)
    expect(result.normalized).toBeNull()
  })

  it('reports both cleanups in one summary', () => {
    const result = normalizeImportedPayload([
      { type: 'text', value: 'Cursor', x: 1, font: 'ppb.ttf', anchor: 'lt' },
      {
        type: 'multiline',
        value: 'a\nb',
        delimiter: '\n',
        x: 1,
        y: 2,
        spacing: 4,
        offset_y: 12,
        font: 'ppb.ttf',
      },
    ] as unknown as DrawElement[])

    expect(result.normalized).toEqual({
      verticalCount: 1,
      verticalTypes: ['text'],
      spacingCount: 1,
    })
  })
})

/**
 * The editor's own parse/validate path must NOT normalize — rewriting the
 * document as the user types is hostile and fights ADR-009's sync contract.
 * Asserted here so nobody "helpfully" extends normalization into it later.
 */
describe('validatePayload (the editor path)', () => {
  it('does not materialize a missing vertical coordinate', () => {
    const result = validatePayload([
      { type: 'text', value: 'Typed', x: 10, font: 'ppb.ttf', anchor: 'lt' },
      { type: 'line', x_start: 0, x_end: 100 },
    ])

    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }
    expect(result.data[0]).not.toHaveProperty('y')
    expect(result.data[1]).not.toHaveProperty('y_start')
  })
})
