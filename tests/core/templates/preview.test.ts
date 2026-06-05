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
})
