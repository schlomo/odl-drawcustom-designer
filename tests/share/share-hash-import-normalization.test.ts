import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../src/core'
import { buildSharePayload, sharePayloadToBootstrap } from '../../src/share'

/**
 * A shared design (`#d=…`, ADR-005) is a payload authored somewhere else — an
 * import. Its `text`/`multiline`/`line` elements that rely on HA's
 * document-flow cursor are materialized at `0`, and the bootstrap carries what
 * changed so the shell can say so.
 */
function bootstrapFor(elements: DrawElement[]) {
  const payload = buildSharePayload({
    name: 'Shared',
    canvas: { width: 296, height: 128, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
    service: undefined,
    elements,
  })
  return sharePayloadToBootstrap(payload, { states: {}, attributes: {} })
}

describe('share-hash import', () => {
  it('materializes missing vertical coordinates and reports them', () => {
    const bootstrap = bootstrapFor([
      { type: 'text', value: 'Cursor', x: 4, font: 'ppb.ttf', anchor: 'lt' },
      { type: 'line', x_start: 0, x_end: 100 },
    ] as unknown as DrawElement[])

    expect(bootstrap.elements).toEqual([
      { type: 'text', value: 'Cursor', x: 4, y: 0, font: 'ppb.ttf', anchor: 'lt' },
      { type: 'line', x_start: 0, y_start: 0, x_end: 100 },
    ])
    expect(bootstrap.normalization).toEqual({
      verticalCount: 2,
      verticalTypes: ['line', 'text'],
      spacingCount: 0,
    })
  })

  it('leaves an explicit shared design untouched and silent', () => {
    const elements = [
      { type: 'text', value: 'Pinned', x: 4, y: 8, font: 'ppb.ttf', anchor: 'lt' },
    ] as unknown as DrawElement[]

    const bootstrap = bootstrapFor(elements)

    expect(bootstrap.elements).toEqual(elements)
    expect(bootstrap.normalization).toBeUndefined()
  })
})
