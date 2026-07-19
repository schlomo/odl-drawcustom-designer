import { describe, expect, it } from 'vitest'
import { renderIconSequence } from '../../../src/core/renderer/icon-sequence'
import type { RenderContext } from '../../../src/core/renderer/types'

const context: RenderContext = { width: 400, height: 200, colorMode: 'bwr' }

describe('renderIconSequence', () => {
  it('emits one positioned icon per icons array entry', () => {
    const icons = ['mdi:home', 'mdi:arrow-right', 'mdi:office-building']
    const result = renderIconSequence(
      {
        type: 'icon_sequence',
        x: 10,
        y: 10,
        icons,
        size: 24,
      },
      context,
    )

    expect(result?.layer).toBe('svg')
    expect(result?.primitive.kind).toBe('icon_sequence')
    expect(result?.primitive.icons).toHaveLength(icons.length)
    expect(result?.primitive.icons.every((icon) => icon.path && icon.path.length > 0)).toBe(true)
  })

  it('lays icons out horizontally for direction right', () => {
    const result = renderIconSequence(
      {
        type: 'icon_sequence',
        x: 0,
        y: 0,
        icons: ['home', 'home'],
        size: 20,
        spacing: 10,
        direction: 'right',
      },
      context,
    )

    const [first, second] = result!.primitive.icons
    expect(first.x).toBe(0)
    expect(first.y).toBe(0)
    expect(second.x).toBe(30)
    expect(second.y).toBe(0)
  })

  it('lays icons out vertically for direction down', () => {
    const result = renderIconSequence(
      {
        type: 'icon_sequence',
        x: 5,
        y: 5,
        icons: ['home', 'home'],
        size: 20,
        spacing: 10,
        direction: 'down',
      },
      context,
    )

    const [first, second] = result!.primitive.icons
    expect(first.x).toBe(5)
    expect(first.y).toBe(5)
    expect(second.x).toBe(5)
    expect(second.y).toBe(35)
  })

  it('throws naming the unknown icon when one name in the list is unrecognized (issue #56)', () => {
    // Decision: a single unknown name fails the WHOLE element, not just that
    // one icon slot — consistent with the no-partial-error-UX ruling used
    // elsewhere (safeRenderElement replaces the entire element with one
    // render-error placeholder, never a partially-rendered mix of good icons
    // and a silently-empty one).
    expect(() =>
      renderIconSequence(
        {
          type: 'icon_sequence',
          x: 0,
          y: 0,
          icons: ['home', 'not-a-real-mdi-icon', 'office-building'],
          size: 24,
        },
        context,
      ),
    ).toThrow(/not-a-real-mdi-icon/)
  })

  // A templated `icons` field (jsonOrTemplateSchema) reaches the renderer as
  // a STRING once the preview evaluator has run (applyTemplateContextToPayload),
  // not as an array — see ADR-013 point 1 ("a single template string that HA
  // evaluates to JSON at runtime"). Home Assistant's own template engine
  // preserves the NATIVE type (a real list) for a template that is a single
  // pure `{{ expr }}` expression, so production never actually stringifies the
  // list at all. The designer's Nunjucks-based preview evaluator has no
  // equivalent native-type channel (`renderString` always stringifies), so a
  // templated icons list arrives here as a plain string — these cases recover
  // the intended icon list from that string on a best-effort basis instead of
  // silently substituting the unrelated `help-circle` preview placeholder
  // (issue #56 follow-up: a plausible-looking wrong icon is exactly the kind
  // of "could pass for genuine content" render the render-error contract
  // exists to avoid).
  it('recovers icon names from a JSON-array template result (e.g. a `tojson`-equivalent filter)', () => {
    const result = renderIconSequence(
      {
        type: 'icon_sequence',
        x: 10,
        y: 10,
        icons: '["home","arrow-right"]',
        size: 24,
      },
      context,
    )

    expect(result?.primitive.icons.map((icon) => icon.name)).toEqual(['home', 'arrow-right'])
    expect(result?.primitive.icons.every((icon) => icon.path)).toBe(true)
  })

  it('recovers icon names from a comma-joined template result (Nunjucks\' default array-to-string coercion)', () => {
    const result = renderIconSequence(
      {
        type: 'icon_sequence',
        x: 10,
        y: 10,
        icons: 'home,arrow-right',
        size: 24,
      },
      context,
    )

    expect(result?.primitive.icons.map((icon) => icon.name)).toEqual(['home', 'arrow-right'])
    expect(result?.primitive.icons.every((icon) => icon.path)).toBe(true)
  })

  it('throws when the icons template still contains unevaluated {{ }} syntax (evaluation did not run or failed)', () => {
    expect(() =>
      renderIconSequence(
        {
          type: 'icon_sequence',
          x: 10,
          y: 10,
          icons: "{{ ['home', 'home2'] }}",
          size: 24,
        },
        context,
      ),
    ).toThrow(/icons/i)
  })

  it('throws when the icons template resolves to an empty value', () => {
    expect(() =>
      renderIconSequence(
        {
          type: 'icon_sequence',
          x: 10,
          y: 10,
          icons: '',
          size: 24,
        },
        context,
      ),
    ).toThrow(/icons/i)
  })

  it('still throws naming an unknown icon recovered from a templated list', () => {
    expect(() =>
      renderIconSequence(
        {
          type: 'icon_sequence',
          x: 10,
          y: 10,
          icons: 'home,not-a-real-mdi-icon',
          size: 24,
        },
        context,
      ),
    ).toThrow(/not-a-real-mdi-icon/)
  })

  it('reports a clean error when icons went missing entirely (UI regression, not a TypeError)', () => {
    expect(() =>
      renderIconSequence(
        {
          type: 'icon_sequence',
          x: 10,
          y: 10,
          icons: undefined,
          size: 24,
        } as never,
        context,
      ),
    ).toThrow(/icons.*(missing|list)/i)
  })
})
