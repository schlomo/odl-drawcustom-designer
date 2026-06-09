import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../../src/core/schema/elements'
import { applyTemplateContextToPayload, type HaMockContext } from '../../../src/core/templates'

const temperatureContext: HaMockContext = {
  states: {
    'sensor.temperature': '21.5',
    'binary_sensor.door': 'on',
  },
}

describe('applyTemplateContextToPayload', () => {
  it('evaluates template strings in text value and color fields', () => {
    const payload: DrawElement[] = [
      {
        type: 'text',
        value: "Temp: {{ states('sensor.temperature') }}°C",
        x: 0,
        y: 0,
        color: "{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}",
      },
    ]

    const preview = applyTemplateContextToPayload(payload, temperatureContext)

    expect(preview[0]).toMatchObject({
      type: 'text',
      value: 'Temp: 21.5°C',
      color: 'red',
    })
  })

  it('leaves non-template strings unchanged', () => {
    const payload: DrawElement[] = [
      {
        type: 'rectangle',
        x_start: 0,
        x_end: 10,
        y_start: 0,
        y_end: 10,
        fill: 'white',
        outline: 'black',
      },
    ]

    const preview = applyTemplateContextToPayload(payload, temperatureContext)

    expect(preview).toEqual(payload)
  })

  it('does not mutate the original payload', () => {
    const payload: DrawElement[] = [
      {
        type: 'text',
        value: "{{ states('sensor.temperature') }}",
        x: 0,
        y: 0,
      },
    ]

    applyTemplateContextToPayload(payload, temperatureContext)

    expect(payload[0].value).toBe("{{ states('sensor.temperature') }}")
  })

  it('evaluates nested plot string fields', () => {
    const payload: DrawElement[] = [
      {
        type: 'plot',
        x: 0,
        y: 0,
        xsize: 100,
        ysize: 50,
        data: [{ x: [1], y: [2] }],
        ylegend: {
          text: "{{ states('sensor.temperature') }}",
        },
      },
    ]

    const preview = applyTemplateContextToPayload(payload, temperatureContext)

    expect((preview[0] as Extract<DrawElement, { type: 'plot' }>).ylegend?.text).toBe('21.5')
  })

  it('evaluates templated icon size and fill for preview', () => {
    const payload: DrawElement[] = [
      {
        type: 'icon',
        value: 'mdi:sunglasses',
        x: 150,
        y: 280,
        size: "{{ (float(states('sensor.uv_index'), 0) * 7 + 24) | round(0) }}",
        fill: "{{ iif(is_state('binary_sensor.example_window', 'on'), 'black', 'none') }}",
        anchor: 'lm',
      },
    ]

    const preview = applyTemplateContextToPayload(payload, {
      states: {
        'sensor.uv_index': '3',
        'binary_sensor.example_window': 'off',
      },
    })

    expect(preview[0]).toMatchObject({
      type: 'icon',
      size: '45',
      fill: 'none',
    })
  })

  it('renders templated icon fill none on canvas preview', async () => {
    const { renderIcon } = await import('../../../src/core/renderer/icon')
    const payload: DrawElement[] = [
      {
        type: 'icon',
        value: 'mdi:sunglasses',
        x: 150,
        y: 280,
        size: "{{ (float(states('sensor.uv_index'), 0) * 7 + 24) | round(0) }}",
        fill: "{{ iif(is_state('binary_sensor.example_window', 'on'), 'black', 'none') }}",
        anchor: 'lm',
      },
    ]

    const preview = applyTemplateContextToPayload(payload, {
      states: {
        'sensor.uv_index': '3',
        'binary_sensor.example_window': 'off',
      },
    })

    const rendered = renderIcon(preview[0] as Extract<DrawElement, { type: 'icon' }>, {
      width: 800,
      height: 480,
      colorMode: 'bwy',
    })

    expect(rendered?.primitive).toMatchObject({
      kind: 'icon',
      fill: 'none',
    })
  })

  it('evaluates now().strftime in text values', () => {
    const payload: DrawElement[] = [
      {
        type: 'text',
        value: "{{ now().strftime('%d.%m.%Y %H:%M') }}",
        x: 0,
        y: 0,
      },
    ]

    const preview = applyTemplateContextToPayload(payload, {
      states: {},
      now: new Date(2026, 5, 6, 23, 44, 0),
    })

    expect((preview[0] as Extract<DrawElement, { type: 'text' }>).value).toBe('06.06.2026 23:44')
  })
})
