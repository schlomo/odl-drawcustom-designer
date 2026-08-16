import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../../src/core/schema/elements'
import { applyTemplateContextToElement, applyTemplateContextToPayload } from '../../../src/core/templates/preview'
import type { HaMockContext } from '../../../src/core/templates/types'

/**
 * Preview-immutability contract: a template-free element is returned AS-IS
 * (not deep-cloned) so consumers that memoize on identity keep their memo
 * across an unrelated edit (issue #124). That optimization is only safe if
 * nothing downstream can mutate the returned object — it is the SAME object
 * still referenced by the source `elements` array, so a mutation would
 * corrupt stored state, not just a throwaway preview. `Object.freeze` under
 * dev/test makes an accidental mutation attempt fail loudly instead of
 * silently corrupting `elements` (guarded so it compiles out of prod builds
 * — see `import.meta.env.DEV`, dead in `vite build`'s production mode).
 */

const context: HaMockContext = { states: {} }

const RECTANGLE: DrawElement = {
  type: 'rectangle',
  x_start: 0,
  y_start: 0,
  x_end: 10,
  y_end: 10,
  fill: 'black',
}

describe('applyTemplateContextToElement preview immutability (issue #124 follow-up)', () => {
  it('freezes a template-free preview element and rejects mutation without corrupting the source', () => {
    const preview = applyTemplateContextToElement(RECTANGLE, context)

    expect(() => {
      ;(preview as { x_start: number }).x_start = 999
    }).toThrow()

    expect(RECTANGLE.x_start).toBe(0)
    expect(preview.x_start).toBe(0)
  })

  it('freezes every template-free element reached through applyTemplateContextToPayload', () => {
    const payload: DrawElement[] = [RECTANGLE]
    const preview = applyTemplateContextToPayload(payload, context)

    expect(() => {
      ;(preview[0] as { x_start: number }).x_start = 999
    }).toThrow()

    expect(payload[0]!.x_start).toBe(0)
  })
})
