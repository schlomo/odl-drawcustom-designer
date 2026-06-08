import { describe, expect, it } from 'vitest'
import { loadBundledTestFont } from '../../core/renderer/font-test-utils'
import { getFontStatusMessages, previewFontsAreReliable } from '../../../src/ui/lib/font-readiness'

describe('font readiness messages', () => {
  const text = {
    type: 'text' as const,
    value: 'Hello',
    font: 'custom.ttf',
    x: 0,
    y: 0,
  }

  it('reports loading state', () => {
    const messages = getFontStatusMessages(
      [text],
      new Map([['custom.ttf', { key: 'custom.ttf', status: 'loading' }]]),
      true,
    )

    expect(messages[0]).toMatchObject({
      severity: 'info',
      title: 'Loading fonts',
    })
    expect(previewFontsAreReliable([text], new Map(), true)).toBe(false)
  })

  it('reports missing fonts as errors', () => {
    const messages = getFontStatusMessages(
      [text],
      new Map([
        [
          'custom.ttf',
          {
            key: 'custom.ttf',
            status: 'missing',
            message: 'custom.ttf is not uploaded.',
          },
        ],
      ]),
      false,
    )

    expect(messages[0]).toMatchObject({
      severity: 'error',
      title: 'Font not available',
      summary: 'custom.ttf is not uploaded.',
    })
  })

  it('warns about templated fonts', () => {
    const messages = getFontStatusMessages(
      [
        {
          type: 'text',
          value: '{{ x }}',
          font: "{{ states('sensor.font') }}",
          x: 0,
          y: 0,
        },
      ],
      new Map(),
      false,
    )

    expect(messages[0]).toMatchObject({
      severity: 'warning',
      title: 'Templated font',
    })
  })

  it('warns when a loaded font is missing glyphs for preview text', () => {
    loadBundledTestFont('rbm.ttf')
    const messages = getFontStatusMessages(
      [
        {
          type: 'text',
          value: 'י״ז ח׳ חשוון',
          font: 'rbm.ttf',
          x: 0,
          y: 0,
        },
      ],
      new Map([['rbm.ttf', { key: 'rbm.ttf', status: 'ready' }]]),
      false,
    )

    expect(messages.some((message) => message.title === 'Missing glyphs')).toBe(true)
  })

  it('is reliable when required fonts are ready', () => {
    const outcomes = new Map([['ppb.ttf', { key: 'ppb.ttf', status: 'ready' as const }]])
    expect(
      previewFontsAreReliable(
        [{ type: 'text', value: 'Hi', x: 0, y: 0 }],
        outcomes,
        false,
      ),
    ).toBe(true)
  })
})
