import { describe, expect, it } from 'vitest'
import { renderIcon } from '../../../src/core/renderer/icon'
import { resolveMdiPath } from '../../../src/core/renderer/mdi-icons'
import type { RenderContext } from '../../../src/core/renderer/types'

const context: RenderContext = { width: 400, height: 200, colorMode: 'bwr' }

describe('renderIcon', () => {
  it('emits a real MDI path for a known icon name', () => {
    const result = renderIcon(
      {
        type: 'icon',
        value: 'account-cowboy-hat',
        x: 60,
        y: 120,
        size: 120,
      },
      context,
    )

    expect(result?.layer).toBe('svg')
    expect(result?.primitive).toMatchObject({
      kind: 'icon',
      size: 120,
      path: resolveMdiPath('account-cowboy-hat'),
      fill: '#000000',
    })
    expect(result?.primitive.path).toBeTruthy()
  })

  it('uses fill for icon color', () => {
    const result = renderIcon(
      {
        type: 'icon',
        value: 'home',
        x: 0,
        y: 0,
        size: 24,
        fill: 'red',
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'icon',
      fill: '#FF0000',
    })
  })

  it('honors fill none for conditional visibility', () => {
    const result = renderIcon(
      {
        type: 'icon',
        value: 'sunglasses',
        x: 0,
        y: 0,
        size: 24,
        fill: 'none',
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'icon',
      fill: 'none',
    })
  })

  it('throws a descriptive error naming the unknown icon instead of rendering an invisible icon (issue #56)', () => {
    // Before the fix, renderIcon silently produced primitive.path === null,
    // giving an empty/invisible SVG with no indication anything was wrong.
    // safeRenderElement relies on renderers throwing to surface the standard
    // render-error placeholder + status banner (see render-error.ts), so an
    // unknown icon name must throw here rather than degrade silently.
    expect(() =>
      renderIcon(
        {
          type: 'icon',
          value: 'not-a-real-mdi-icon',
          x: 0,
          y: 0,
          size: 24,
        },
        context,
      ),
    ).toThrow(/not-a-real-mdi-icon/)
  })
})
