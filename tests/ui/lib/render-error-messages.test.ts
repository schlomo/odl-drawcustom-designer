import { afterEach, describe, expect, it } from 'vitest'
import { registerFont, unregisterFont, type DrawElement, type RenderContext } from '../../../src/core'
import {
  collectElementRenderErrors,
  getRenderErrorStatusMessages,
} from '../../../src/ui/lib/render-error-messages'

/**
 * A render-time exception must surface as a user-visible status message, not
 * just as internal state — the whole point of issue #10 is that failures were
 * previously invisible (console-only at best, nothing at worst).
 */
describe('render error status messages', () => {
  const ctx: RenderContext = { width: 200, height: 200, colorMode: 'bw' }
  const BROKEN_FONT_KEY = 'broken-render-error-messages.ttf'

  afterEach(() => {
    unregisterFont(BROKEN_FONT_KEY)
  })

  it('collects the failing element index and message', () => {
    registerFont(BROKEN_FONT_KEY, {} as never)
    const elements: DrawElement[] = [
      { type: 'rectangle', x_start: 0, y_start: 0, x_end: 10, y_end: 10 },
      { type: 'text', value: 'Hi', x: 0, y: 0, font: BROKEN_FONT_KEY },
    ]

    const errors = collectElementRenderErrors(elements, ctx)

    // The exact opentype.js method name in the message is an implementation
    // detail (it can shift depending on which font-handling fallback paths
    // exist) — assert the stable contract: element 1 failed, with a message.
    expect(errors).toHaveLength(1)
    expect(errors[0]?.index).toBe(1)
    expect(typeof errors[0]?.message).toBe('string')
    expect(errors[0]?.message.length).toBeGreaterThan(0)
  })

  it('surfaces a visible error StatusMessage for the failing element', () => {
    registerFont(BROKEN_FONT_KEY, {} as never)
    const elements: DrawElement[] = [
      { type: 'text', value: 'Hi', x: 0, y: 0, font: BROKEN_FONT_KEY },
    ]

    const messages = getRenderErrorStatusMessages(elements, ctx)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      severity: 'error',
      title: 'Element failed to render',
    })
    expect(messages[0]?.summary).toContain('Element 1')
  })

  it('reports no errors for elements that render successfully', () => {
    const elements: DrawElement[] = [
      { type: 'rectangle', x_start: 0, y_start: 0, x_end: 10, y_end: 10 },
    ]

    expect(getRenderErrorStatusMessages(elements, ctx)).toEqual([])
  })
})
